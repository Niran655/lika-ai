from __future__ import annotations

import tempfile
from pathlib import Path

from owner_ai_model import OwnerAiPythonModel


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        model = OwnerAiPythonModel(Path(temp_dir) / "training.jsonl")
        saved = model.train(
            {
                "instruction": "When asked about local AI, explain that owner-ai-python uses local training memory.",
                "response": "owner-ai-python answers from local rules and saved training examples.",
                "tags": ["local-ai", "training"],
            }
        )
        assert saved["instruction"]

        reply = model.generate(
            [{"role": "user", "content": "How does local AI training memory work?"}]
        )
        assert "owner-ai-python" in reply

        tool_reply = model.generate(
            [{"role": "user", "content": "use tool calculate 2 + 3 * 4 and show training stats"}]
        )
        assert "Tools used:" in tool_reply
        assert "calculator" in tool_reply
        assert "14" in tool_reply

        detection = model.report_ai_detection('fetch("/api/test").then((r) => r.json())')
        assert detection["humanPercent"] + detection["aiPercent"] == 100
        assert detection["bugs"]

        plagiarism = model.report_plagiarism("In conclusion, it is important to note this topic.")
        assert plagiarism["similarityPercent"] > 10

    print("owner-ai-python model smoke test passed")


if __name__ == "__main__":
    main()
