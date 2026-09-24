import os
import sqlite3
import traceback
from typing import Dict, Any, Iterator, Optional, List

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.documents import Document
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import create_retriever_tool, Tool
from langchain_core.messages import AIMessage
from langchain_classic.memory import ConversationBufferMemory
from langchain_groq import ChatGroq


# ===================== SYSTEM PROMPT =====================

AGENT_SYSTEM = """You are a helpful, precise AI assistant and conversational chatbot. 

CRITICAL INSTRUCTIONS:
- **Direct Answers Only**: Answer the user's current question or request directly and concisely. 
- **NO RE-SUMMARIZING**: Do NOT provide a full document summary, background, or overview unless the user explicitly uses the word "summarize" or asks for a summary. If the user asks a specific follow-up question (e.g., about dates, deadlines, or specific facts), answer ONLY that specific question.
- **Persistent Document Context**: If document text is present in <PERSISTENT_DOCUMENT_CONTEXT>, use it to answer specific follow-up questions without requiring a re-upload or re-summarizing.
- Answer general questions, drafts, or requests accurately.
- If the user asks about database legal cases, use the 'cases_retriever' tool.
- You MUST NOT suggest lawyers unless the user EXPLICITLY asks for lawyer recommendations.
- If the user asks for lawyer recommendations without a location, ask for the location first.
- When suggesting lawyers, use ONLY the 'lawyer_finder' tool and return ONLY their names.
- Do NOT expose database, SQL, or internal tool signatures.

CITATION RULES:
- Cite sources as (filename p.#) when using retrieved documents or uploaded texts.
"""

# ===================== TOOL DESCRIPTIONS =====================

CASE_TOOL_DESC = (
    "Search preprocessed legal case documents. "
    "Use focused legal queries. Returns relevant excerpts with filename and page number."
)

LAWYER_TOOL_DESC = (
    "Find lawyers based on a specific location. "
    "Use ONLY when the user explicitly asks for lawyer recommendations "
    "AND a location is known."
)

# ===================== AGENT ORCHESTRATOR =====================

class AgentOrchestrator:
    def __init__(self, gemini_api_key: Optional[str] = None, vector_store=None, db_path: str = "./app.db"):
        self.db_path = db_path
        
        # Session-isolated stores
        self.session_documents: Dict[str, str] = {}
        self.memories: Dict[str, ConversationBufferMemory] = {}

        groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.llm = ChatGroq(
            model="openai/gpt-oss-20b",
            groq_api_key=groq_api_key,
            temperature=0.1,
        )

        # ---- Vector Retriever ----
        self.vector_store = vector_store
        self.retriever = vector_store.as_retriever(search_kwargs={"k": 6}) if vector_store else None

        tools = []
        if self.retriever:
            self.case_tool = create_retriever_tool(
                retriever=self.retriever,
                name="cases_retriever",
                description=CASE_TOOL_DESC,
            )
            tools.append(self.case_tool)

        # ---- Lawyer Finder Tool ----
        self.lawyer_tool = Tool(
            name="lawyer_finder",
            description=LAWYER_TOOL_DESC,
            func=self._find_lawyers_by_location,
        )
        tools.append(self.lawyer_tool)

        prompt = ChatPromptTemplate.from_messages([
            ("system", AGENT_SYSTEM),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}\n\n{user_doc_hint}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])

        self.agent = create_tool_calling_agent(
            llm=self.llm,
            tools=tools,
            prompt=prompt,
        )

        # Default executor; memory will be dynamically swapped per session
        default_memory = ConversationBufferMemory(
            memory_key="chat_history",
            input_key="input",
            return_messages=True,
        )
        self.executor = AgentExecutor(
            agent=self.agent,
            tools=tools,
            memory=default_memory,
            verbose=False,
            handle_parsing_errors=True,
            max_iterations=10,
        )

    # ===================== SQL TOOL LOGIC =====================

    def _find_lawyers_by_location(self, location: str) -> str:
        if not location or not location.strip():
            return "No location provided."

        location = location.strip().lower()

        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row

            rows = conn.execute(
                """
                SELECT email, location_name
                FROM users
                WHERE role = 'lawyer'
                """
            ).fetchall()
            conn.close()
        except Exception:
            return "No lawyers found."

        if not rows:
            return "No lawyers found."

        matched = [
            row["email"] for row in rows
            if location in (row["location_name"] or "").lower() or location in row["email"].lower()
        ]

        if not matched:
            matched = [row["email"] for row in rows]

        return ", ".join(matched) if matched else "No lawyers found in that area."

    # ===================== HELPERS =====================

    def _get_memory(self, session_id: Optional[str]) -> ConversationBufferMemory:
        sid = session_id or "default"
        if sid not in self.memories:
            self.memories[sid] = ConversationBufferMemory(
                memory_key="chat_history",
                input_key="input",
                return_messages=True,
            )
        return self.memories[sid]

    def _make_user_doc_hint(self, session_id: Optional[str], text: Optional[str]) -> str:
        sid = session_id or "default"
        
        # Cache newly uploaded text if provided
        if text and text.strip():
            self.session_documents[sid] = text
            
        # Retrieve cached document text for this session
        cached_doc = self.session_documents.get(sid)
        if not cached_doc:
            return ""
            
        return f"<PERSISTENT_DOCUMENT_CONTEXT>\n{cached_doc}\n</PERSISTENT_DOCUMENT_CONTEXT>"

    def _sanitize_memory(self, memory: ConversationBufferMemory):
        """Pops dangling AI messages to prevent history alternation errors."""
        try:
            if hasattr(memory, "chat_memory") and memory.chat_memory.messages:
                messages = memory.chat_memory.messages
                while messages and isinstance(messages[-1], AIMessage):
                    messages.pop()
        except Exception:
            memory.clear()

    def reset_memory(self, session_id: Optional[str] = None):
        if session_id:
            sid = session_id or "default"
            if sid in self.memories:
                self.memories[sid].clear()
            if sid in self.session_documents:
                del self.session_documents[sid]
        else:
            self.memories.clear()
            self.session_documents.clear()

    # ===================== ANSWER =====================

    def answer(
        self,
        user_message: str,
        session_id: Optional[str],
        user_doc_text: Optional[str],
        top_k: int,
    ) -> Dict[str, Any]:
        if self.retriever:
            self.retriever.search_kwargs["k"] = int(top_k)
            
        memory = self._get_memory(session_id)
        self.executor.memory = memory
        self._sanitize_memory(memory)

        inputs = {
            "input": user_message,
            "user_doc_hint": self._make_user_doc_hint(session_id, user_doc_text),
        }

        final_output = ""
        try:
            out = self.executor.invoke(inputs)
            if isinstance(out, dict):
                final_output = out.get("output", "")
            else:
                final_output = str(out)
        except Exception as e:
            print("EXEC_ERROR:", traceback.format_exc())
            if "model turn" in str(e).lower() or "400" in str(e):
                self.reset_memory(session_id)
                try:
                    out = self.executor.invoke(inputs)
                    final_output = out.get("output", "") if isinstance(out, dict) else str(out)
                except Exception as e2:
                    print("RETRY_ERROR:", traceback.format_exc())

        # Direct LLM fallback if executor response is blank
        if not final_output or not final_output.strip():
            try:
                doc_hint = self._make_user_doc_hint(session_id, user_doc_text)
                fallback_prompt = f"Answer this specific user request directly and concisely based on the context without re-summarizing the entire document:\nUser Request: {user_message}\n\nContext: {doc_hint}"
                res = self.llm.invoke(fallback_prompt)
                final_output = res.content if hasattr(res, "content") else str(res)
            except Exception:
                print("FALLBACK_ERROR:", traceback.format_exc())
                final_output = "I received your request, but encountered an error. Please try asking again."

        cites = []
        try:
            if self.retriever:
                retrieved: List[Document] = self.retriever.invoke(user_message)
                for d in retrieved[:top_k]:
                    meta = d.metadata or {}
                    cites.append({
                        "filename": meta.get("source") or meta.get("filename"),
                        "page": meta.get("page"),
                    })
        except Exception:
            pass

        return {
            "session_id": session_id,
            "answer": final_output,
            "citations": cites,
        }

    # ===================== STREAMING =====================

    def stream_answer(
        self,
        user_message: str,
        session_id: Optional[str],
        user_doc_text: Optional[str],
        top_k: int,
    ) -> Iterator[str]:
        if self.retriever:
            self.retriever.search_kwargs["k"] = int(top_k)
            
        memory = self._get_memory(session_id)
        self.executor.memory = memory
        self._sanitize_memory(memory)

        inputs = {
            "input": user_message,
            "user_doc_hint": self._make_user_doc_hint(session_id, user_doc_text),
        }

        config = RunnableConfig(configurable={"session_id": session_id or "default"})

        has_yielded = False
        try:
            for event in self.executor.stream(inputs, config=config):
                has_yielded = True
                try:
                    yield event.model_dump_json()
                except AttributeError:
                    import json
                    yield json.dumps(event)
        except Exception as e:
            print("STREAM_ERROR:", traceback.format_exc())
                
        if not has_yielded:
            import json
            res = self.answer(user_message, session_id, user_doc_text, top_k)
            yield json.dumps({"output": res["answer"]})