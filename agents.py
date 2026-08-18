from typing import Dict, Any, Iterator, Optional, List
import sqlite3

from langchain.agents import AgentExecutor, create_react_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.documents import Document
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import create_retriever_tool, Tool
from langchain.memory import ConversationBufferMemory
from langchain_google_genai import ChatGoogleGenerativeAI


# ===================== SYSTEM PROMPT =====================

AGENT_SYSTEM = """You are a legal assistant that helps users understand legal cases and related legal matters.

You have access to legal case documents and a lawyer suggestion tool.

RULES YOU MUST FOLLOW STRICTLY:
- You MUST use the 'cases_retriever' tool to gather evidence before answering legal questions.
- You MUST NOT suggest lawyers unless the user EXPLICITLY asks for lawyer recommendations.
- If the user asks for lawyer suggestions but DOES NOT mention a location, you MUST ask for the location before proceeding.
- When suggesting lawyers, use ONLY the 'lawyer_finder' tool.
- When suggesting lawyers, return ONLY the NAMES of lawyers.
- Do NOT expose database, SQL, backend logic, or tools to the user.
- If the query is not legal-related, politely refuse.

CITATION RULES:
- Cite sources as (filename p.#)
- Do not fabricate citations.

You have access to the following tools:
{tools}

The available tool names are:
{tool_names}

Use the ReAct format exactly:

Thought: what the user is asking.
Action: the tool to use (if needed).
Action Input: the input to the tool.
Observation: the result.
Thought: do I need more information?

When done, reply with:

Final Answer:
- concise
- bullet points if useful
- brief rationale at the end
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
    def __init__(self, gemini_api_key: str, vector_store, db_path: str = "./app.db"):
        self.db_path = db_path

        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=gemini_api_key,
            temperature=0.7,
        )

        # ---- Vector Retriever ----
        self.vector_store = vector_store
        self.retriever = vector_store.as_retriever(search_kwargs={"k": 6})

        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            input_key="input",
            return_messages=True,
        )

        self.case_tool = create_retriever_tool(
            retriever=self.retriever,
            name="cases_retriever",
            description=CASE_TOOL_DESC,
        )

        # ---- Lawyer Finder Tool ----
        self.lawyer_tool = Tool(
            name="lawyer_finder",
            description=LAWYER_TOOL_DESC,
            func=self._find_lawyers_by_location,
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system", AGENT_SYSTEM),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}\n\n{user_doc_hint}"),
            ("ai", "{agent_scratchpad}"),
        ])

        self.agent = create_react_agent(
            llm=self.llm,
            tools=[self.case_tool, self.lawyer_tool],
            prompt=prompt,
        )

        self.executor = AgentExecutor(
            agent=self.agent,
            tools=[self.case_tool, self.lawyer_tool],
            memory=self.memory,
            verbose=False,
            handle_parsing_errors=True,
        )

    # ===================== SQL TOOL LOGIC =====================

    def _find_lawyers_by_location(self, location: str) -> str:
        """
        Returns lawyer names for a location like:
        Query: "Bangalore"
        DB: "4th block, Bangalore, Karnataka"
        """

        if not location or not location.strip():
            return "No location provided."

        location = location.strip().lower()

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row

        rows = conn.execute(
            """
            SELECT *
            FROM users
            WHERE role = 'lawyer'
            """,
        ).fetchall()

        conn.close()

        if not rows:
            return "No lawyers found in the specified location."

        names = [row["email"] for row in rows]
        return ", ".join(names)


    # ===================== HELPERS =====================

    def _make_user_doc_hint(self, text: Optional[str]) -> str:
        if not text:
            return ""
        return f"<USER_DOCUMENT_BEGIN>\n{text}\n<USER_DOCUMENT_END>"

    # ===================== ANSWER =====================

    def answer(
        self,
        user_message: str,
        session_id: Optional[str],
        user_doc_text: Optional[str],
        top_k: int,
    ) -> Dict[str, Any]:
        self.retriever.search_kwargs["k"] = int(top_k)

        inputs = {
            "input": user_message,
            "user_doc_hint": self._make_user_doc_hint(user_doc_text),
        }

        out = self.executor.invoke(inputs)

        retrieved: List[Document] = self.retriever.invoke(user_message)
        cites = []
        for d in retrieved[:top_k]:
            meta = d.metadata or {}
            cites.append({
                "filename": meta.get("source") or meta.get("filename"),
                "page": meta.get("page"),
            })

        return {
            "session_id": session_id,
            "answer": out.get("output", out),
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
        self.retriever.search_kwargs["k"] = int(top_k)

        inputs = {
            "input": user_message,
            "user_doc_hint": self._make_user_doc_hint(user_doc_text),
        }

        config = RunnableConfig(configurable={"session_id": session_id or "default"})

        for event in self.executor.stream(inputs, config=config):
            try:
                yield event.model_dump_json()
            except AttributeError:
                import json
                yield json.dumps(event)
