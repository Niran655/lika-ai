from __future__ import annotations

import json
import re
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from owner_ai_model import OwnerAiPythonModel, latest_user_message

HOST = "127.0.0.1"
PORT = 8765
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
TRAINING_FILE = DATA_DIR / "owner_ai_training.jsonl"
MODEL = OwnerAiPythonModel(TRAINING_FILE, DATA_DIR.parent)


def completion_response(body: dict[str, Any]) -> dict[str, Any]:
    messages = body.get("messages") or []
    content = latest_user_message(messages)
    tool_choice = body.get("tool_choice") or {}
    function_name = (tool_choice.get("function") or {}).get("name")

    message: dict[str, Any]
    finish_reason = "stop"
    if function_name == "report_ai_detection":
        message = {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": f"call_{uuid.uuid4().hex[:12]}",
                    "type": "function",
                    "function": {
                        "name": function_name,
                        "arguments": json.dumps(MODEL.report_ai_detection(content), ensure_ascii=False),
                    },
                }
            ],
        }
        finish_reason = "tool_calls"
    elif function_name == "report_plagiarism":
        message = {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": f"call_{uuid.uuid4().hex[:12]}",
                    "type": "function",
                    "function": {
                        "name": function_name,
                        "arguments": json.dumps(MODEL.report_plagiarism(content), ensure_ascii=False),
                    },
                }
            ],
        }
        finish_reason = "tool_calls"
    else:
        message = {"role": "assistant", "content": MODEL.generate(messages)}

    return {
        "id": f"chatcmpl_{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": MODEL.name,
        "choices": [{"index": 0, "message": message, "finish_reason": finish_reason}],
    }


def stream_chunks(text: str) -> list[str]:
    chunks = []
    for piece in re.split(r"(\s+)", text):
        if piece:
            chunks.append(
                "data: "
                + json.dumps({"choices": [{"delta": {"content": piece}}]}, ensure_ascii=False)
                + "\n\n"
            )
    chunks.append("data: [DONE]\n\n")
    return chunks


class OwnerAiHandler(BaseHTTPRequestHandler):
    server_version = "OwnerAI/0.2"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[owner-ai] {self.address_string()} - {format % args}")

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "model": MODEL.name,
                    "training_examples": len(MODEL.load_training()),
                },
            )
            return
        if self.path == "/v1/tools":
            self.send_json(200, {"model": MODEL.name, "tools": MODEL.tools.tool_names()})
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        try:
            if self.path == "/v1/train":
                saved = MODEL.train(self.read_json())
                self.send_json(200, {"ok": True, "model": MODEL.name, "saved": saved})
                return

            if self.path != "/v1/chat/completions":
                self.send_json(404, {"error": "Not found"})
                return

            body = self.read_json()
            if body.get("stream"):
                text = MODEL.generate(body.get("messages") or [])
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                for chunk in stream_chunks(text):
                    self.wfile.write(chunk.encode("utf-8"))
                    self.wfile.flush()
                return

            self.send_json(200, completion_response(body))
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), OwnerAiHandler)
    print(f"{MODEL.name} API running at http://{HOST}:{PORT}")
    print("Endpoints: GET /health, POST /v1/train, POST /v1/chat/completions")
    server.serve_forever()


if __name__ == "__main__":
    main()
