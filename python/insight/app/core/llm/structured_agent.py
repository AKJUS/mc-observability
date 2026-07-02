import logging

from langchain_core.messages import HumanMessage

logger = logging.getLogger(__name__)

_COERCION_PROMPT = (
    "Using only the investigation and evidence in the conversation above, output the final answer "
    "strictly as the required structured result. If some evidence is missing, partial, or failed, "
    "still produce the result: record those gaps under limitations and lower confidence accordingly. "
    "Do not ask for more information and do not call any tools."
)


class StructuredFallbackAgent:
    """Wrap a create_agent runner and guarantee a structured_response.

    Local (Ollama) models reliably run tools but frequently end a multi-step agent run
    with a plain-text answer instead of emitting the schema via response_format, leaving
    structured_response empty. When that happens we make one dedicated
    ``llm.with_structured_output(schema)`` call over the finished conversation to coerce
    the result into the schema (constrained decoding on Ollama, native tool/JSON on
    OpenAI). Providers that already return a structured_response pass straight through, so
    this only adds a recovery path and never changes the successful case.
    """

    def __init__(self, agent, llm, response_format):
        self._agent = agent
        self._llm = llm
        self._response_format = response_format

    async def ainvoke(self, payload, config=None):
        result = await self._agent.ainvoke(payload, config=config)
        if self._response_format is None:
            return result
        if _get(result, "structured_response") is not None:
            return result

        messages = list(_get(result, "messages") or [])
        if not messages:
            return result
        try:
            structured = await self._llm.with_structured_output(self._response_format).ainvoke(
                [*messages, HumanMessage(content=_COERCION_PROMPT)]
            )
        except Exception as exc:
            logger.warning("Structured-output fallback failed: %s", exc)
            return result

        try:
            result["structured_response"] = structured
        except Exception:
            result = {**dict(result), "structured_response": structured}
        return result

    def __getattr__(self, name):
        # Delegate everything else (streaming, get_state, ...) to the wrapped agent.
        return getattr(self._agent, name)


def _get(result, key):
    try:
        return result.get(key)
    except AttributeError:
        return getattr(result, key, None)


def wrap_with_structured_fallback(agent, llm, response_format):
    """Return the agent wrapped so a missing structured_response is coerced from the run."""
    if response_format is None:
        return agent
    return StructuredFallbackAgent(agent, llm, response_format)
