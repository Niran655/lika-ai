from __future__ import annotations

import ast
import operator
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


@dataclass
class ToolResult:
    name: str
    output: str


class SafeCalculator(ast.NodeVisitor):
    operators: dict[type[ast.operator | ast.unaryop], Callable[..., float]] = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    def visit_Expression(self, node: ast.Expression) -> float:
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> float:
        if isinstance(node.value, int | float):
            return float(node.value)
        raise ValueError("Only numbers are allowed.")

    def visit_BinOp(self, node: ast.BinOp) -> float:
        op = self.operators.get(type(node.op))
        if not op:
            raise ValueError("Operator is not allowed.")
        return float(op(self.visit(node.left), self.visit(node.right)))

    def visit_UnaryOp(self, node: ast.UnaryOp) -> float:
        op = self.operators.get(type(node.op))
        if not op:
            raise ValueError("Operator is not allowed.")
        return float(op(self.visit(node.operand)))

    def generic_visit(self, node: ast.AST) -> float:
        raise ValueError(f"Expression node is not allowed: {type(node).__name__}")


class OwnerAiTools:
    def __init__(self, workspace: Path, training_file: Path) -> None:
        self.workspace = workspace
        self.training_file = training_file

    def tool_names(self) -> list[str]:
        return ["calculator", "clock", "project_files", "training_stats"]

    def calculator(self, expression: str) -> ToolResult:
        tree = ast.parse(expression, mode="eval")
        value = SafeCalculator().visit(tree)
        clean = int(value) if value.is_integer() else round(value, 8)
        return ToolResult("calculator", f"{expression} = {clean}")

    def clock(self) -> ToolResult:
        return ToolResult("clock", time.strftime("%Y-%m-%d %H:%M:%S %z"))

    def project_files(self, limit: int = 20) -> ToolResult:
        ignored = {".git", "node_modules", "dist", ".wrangler", ".tanstack"}
        files: list[str] = []
        for path in self.workspace.rglob("*"):
            if any(part in ignored for part in path.parts):
                continue
            if path.is_file():
                files.append(str(path.relative_to(self.workspace)).replace("\\", "/"))
            if len(files) >= limit:
                break
        return ToolResult("project_files", "\n".join(files) or "No files found.")

    def training_stats(self) -> ToolResult:
        if not self.training_file.exists():
            return ToolResult("training_stats", "0 training examples saved.")
        count = len([line for line in self.training_file.read_text(encoding="utf-8").splitlines() if line.strip()])
        return ToolResult("training_stats", f"{count} training examples saved.")

    def choose_tools(self, prompt: str) -> list[ToolResult]:
        lower = prompt.lower()
        results: list[ToolResult] = []

        if any(word in lower for word in ["time", "date", "clock", "today"]):
            results.append(self.clock())

        expression = self._extract_math_expression(prompt)
        if expression:
            try:
                results.append(self.calculator(expression))
            except ValueError as exc:
                results.append(ToolResult("calculator", f"Could not calculate: {exc}"))

        if any(phrase in lower for phrase in ["list files", "project files", "show files", "workspace files"]):
            results.append(self.project_files())

        if any(phrase in lower for phrase in ["training stats", "how many training", "memory stats"]):
            results.append(self.training_stats())

        return results

    def _extract_math_expression(self, prompt: str) -> str | None:
        allowed = set("0123456789+-*/().% ")
        pieces = ["".join(char if char in allowed else " " for char in prompt)]
        candidates = [piece.strip() for piece in pieces[0].split("  ") if piece.strip()]
        for candidate in sorted(candidates, key=len, reverse=True):
            if any(op in candidate for op in ["+", "-", "*", "/", "%"]) and any(char.isdigit() for char in candidate):
                return candidate
        return None
