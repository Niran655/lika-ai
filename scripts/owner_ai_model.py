from __future__ import annotations

import json
import math
import re
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from owner_ai_tools import OwnerAiTools, ToolResult


def latest_user_message(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return message.get("content", "")
    return ""


def has_khmer(text: str) -> bool:
    return any("\u1780" <= char <= "\u17ff" for char in text)


def code_block(language: str, body: str) -> str:
    return f"```{language}\n{body.rstrip()}\n```"


def tokenize(text: str) -> list[str]:
    return re.findall(r"[\w\u1780-\u17ff]+", text.lower())


def cosine_score(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0

    left = Counter(a)
    right = Counter(b)
    shared = set(left) & set(right)
    dot = sum(left[word] * right[word] for word in shared)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


@dataclass
class TrainingMatch:
    row: dict[str, Any]
    score: float


class OwnerAiPythonModel:
    name = "owner-ai-python"

    def __init__(self, training_file: Path, workspace: Path | None = None) -> None:
        self.training_file = training_file
        self.workspace = workspace or training_file.resolve().parents[1]
        self.tools = OwnerAiTools(self.workspace, training_file)

    def load_training(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self.training_file.exists():
            return []

        rows: list[dict[str, Any]] = []
        lines = self.training_file.read_text(encoding="utf-8").splitlines()
        for line in lines[-limit:]:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return rows

    def train(self, item: dict[str, Any]) -> dict[str, Any]:
        self.training_file.parent.mkdir(exist_ok=True)
        saved = {
            "instruction": item.get("instruction") or item.get("input") or item.get("note") or "",
            "response": item.get("response") or item.get("output") or "",
            "tags": item.get("tags") or [],
            "created_at": int(time.time()),
        }
        with self.training_file.open("a", encoding="utf-8") as file:
            file.write(json.dumps(saved, ensure_ascii=False) + "\n")
        return saved

    def search_training(self, prompt: str, limit: int = 3) -> list[TrainingMatch]:
        prompt_tokens = tokenize(prompt)
        matches: list[TrainingMatch] = []

        for row in self.load_training():
            text = " ".join(
                str(value)
                for value in [row.get("instruction"), row.get("response"), " ".join(row.get("tags") or [])]
                if value
            )
            score = cosine_score(prompt_tokens, tokenize(text))
            if score > 0:
                matches.append(TrainingMatch(row=row, score=score))

        matches.sort(key=lambda match: match.score, reverse=True)
        return matches[:limit]

    def generate(self, messages: list[dict[str, str]]) -> str:
        prompt = latest_user_message(messages).strip()
        khmer = has_khmer(prompt)

        if not prompt:
            return "Ask me what you want to build, debug, or learn."

        lower = prompt.lower()
        matches = self.search_training(prompt)
        tool_results = self.tools.choose_tools(prompt)
        exact_response = next((match.row.get("response") for match in matches if match.score >= 0.72 and match.row.get("response")), None)
        if exact_response:
            return self._localize(str(exact_response) + self._tool_note(tool_results), khmer)

        if "react" in lower and "useeffect" in lower:
            answer = self._react_use_effect()
        elif any(word in lower for word in ["debug", "error", "bug", "fix", "not working"]):
            answer = (
                "Cause: I need the exact error and file to identify the failing path.\n\n"
                "Fix: send the error message, the relevant code, and what you expected to happen. I will check data shape, async timing, env config, and response handling.\n\n"
                "Test: after the fix, rerun the failing workflow and add one focused regression test when possible."
            )
        elif any(word in lower for word in ["train", "training", "learn", "remember", "model"]):
            answer = (
                "The `owner-ai-python` model is local and trainable. Use `POST /v1/train` with `instruction`, optional `response`, and optional `tags`. "
                "Training examples are stored in `data/owner_ai_training.jsonl`, then retrieved by similarity during chat."
            )
        elif "tool" in lower or tool_results:
            answer = (
                "I can use local tools now. Available tools: "
                + ", ".join(self.tools.tool_names())
                + "."
            )
        elif "api" in lower and "python" in lower:
            answer = (
                "The local Python API serves the `owner-ai-python` model with `/health`, `/v1/train`, and `/v1/chat/completions`. "
                "It is OpenAI-compatible enough for this app, but it does not call OpenAI or require an API key."
            )
        else:
            answer = (
                "I am `owner-ai-python`, your local model. I can answer coding questions, use your saved training examples, "
                "and return structured analysis for the app tools. This is a lightweight local model, so it learns from examples "
                "by retrieval and rules rather than deep neural fine-tuning."
            )

        memory = self._memory_note(matches)
        return self._localize(answer + self._tool_note(tool_results) + memory, khmer)

    def report_ai_detection(self, content: str) -> dict[str, Any]:
        lines = [line for line in content.splitlines() if line.strip()]
        text = content.lower()
        ai_score = 35

        if re.search(r"\b(foo|bar|baz|example|sample|data)\b", text):
            ai_score += 10
        if "todo" in text or "hack" in text:
            ai_score -= 8
        if len(lines) > 12 and sum(1 for line in lines if line.startswith(("  ", "    "))) / max(len(lines), 1) > 0.6:
            ai_score += 8
        if re.search(r"catch\s*\([^)]*\)\s*{\s*console\.error", content):
            ai_score += 8
        if re.search(r"\b(any|unknown)\b", text):
            ai_score += 4
        if re.search(r"\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b", content):
            ai_score -= 3

        ai_score = max(5, min(95, ai_score))
        human_score = 100 - ai_score

        bugs: list[str] = []
        if "json.parse" in text and "try" not in text:
            bugs.append("JSON.parse appears without local error handling.")
        if "fetch(" in text and ".ok" not in text:
            bugs.append("fetch response status may not be checked before reading the body.")
        if "useeffect" in text and "[]" in text and "eslint-disable" in text:
            bugs.append("Effect dependencies may be intentionally suppressed; verify stale closure risk.")

        return {
            "humanPercent": human_score,
            "aiPercent": ai_score,
            "verdict": "mostly-ai" if ai_score >= 65 else "mostly-human" if ai_score <= 35 else "mixed",
            "confidence": "medium" if len(content) > 500 else "low",
            "signals": [
                "Local heuristic estimate from structure, naming, comments, and error-handling patterns.",
                "No internet lookup or external AI provider was used.",
            ],
            "bugs": bugs,
            "improvements": [
                "Add focused tests for important branches.",
                "Keep error messages specific and actionable.",
            ],
            "summary": "`owner-ai-python` analyzed the code with offline heuristics.",
        }

    def report_plagiarism(self, content: str) -> dict[str, Any]:
        stock_patterns = [
            "in conclusion",
            "throughout history",
            "it is important to note",
            "in today's society",
            "according to many experts",
        ]
        lower = content.lower()
        hits = [phrase for phrase in stock_patterns if phrase in lower]
        percent = min(85, 10 + len(hits) * 18)

        return {
            "similarityPercent": percent,
            "verdict": "likely-copied" if percent >= 60 else "uncertain" if percent >= 30 else "original",
            "passages": [{"text": phrase, "reason": "Stock phrase often appears in generic copied text."} for phrase in hits],
            "summary": "`owner-ai-python` offline estimate only. No web search or plagiarism database was used.",
        }

    def _react_use_effect(self) -> str:
        return (
            "useEffect runs side effects after React renders. Use it for fetching data, subscriptions, timers, and syncing with browser APIs.\n\n"
            + code_block(
                "tsx",
                """import { useEffect, useState } from "react";

export function UserName({ userId }: { userId: string }) {
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const response = await fetch(`/api/users/${userId}`);
      const user = await response.json();
      if (!cancelled) setName(user.name);
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <p>{name || "Loading..."}</p>;
}""",
            )
            + "\n\nThe dependency array `[userId]` means the effect reruns when `userId` changes."
        )

    def _memory_note(self, matches: list[TrainingMatch]) -> str:
        useful = [match for match in matches if match.score >= 0.18]
        if not useful:
            return ""

        lines = []
        for match in useful:
            instruction = match.row.get("instruction")
            if instruction:
                lines.append(f"- {instruction}")

        if not lines:
            return ""

        return "\n\nOwner training memory used:\n" + "\n".join(lines)

    def _tool_note(self, results: list[ToolResult]) -> str:
        if not results:
            return ""

        lines = [f"- {result.name}: {result.output}" for result in results]
        return "\n\nTools used:\n" + "\n".join(lines)

    def _localize(self, answer: str, khmer: bool) -> str:
        if not khmer:
            return answer
        return (
            "បានហើយ។ នេះជា `owner-ai-python` model ដែលរត់ local មិនប្រើ API key។\n\n"
            f"{answer}"
        )
