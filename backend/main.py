
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import ast
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


app = FastAPI(
    title="AI Code Review API",
    description="AI-powered code review and bug detection API",
    version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# REQUEST MODEL
# ==========================================

class AnalyzeRequest(BaseModel):
    code: str
    language: str = "python"


# ==========================================
# PYTHON ANALYZER
# ==========================================

class CodeAnalyzer(ast.NodeVisitor):

    def __init__(self):
        self.issues = []

    def visit_Compare(self, node):

        for operator, comparator in zip(
            node.ops,
            node.comparators
        ):

            if (
                isinstance(operator, ast.Eq)
                and isinstance(comparator, ast.Constant)
                and comparator.value is None
            ):

                self.issues.append({
                    "type": "Code Quality",
                    "message": "Use 'is None' instead of '== None'.",
                    "line": node.lineno
                })

        self.generic_visit(node)

    def visit_ExceptHandler(self, node):

        if node.type is None:

            self.issues.append({
                "type": "Code Quality",
                "message": "Avoid bare except blocks. Catch a specific exception.",
                "line": node.lineno
            })

        self.generic_visit(node)

    def visit_Call(self, node):

        if (
            isinstance(node.func, ast.Name)
            and node.func.id in ["eval", "exec"]
        ):

            self.issues.append({
                "type": "Security",
                "message": f"Avoid using {node.func.id}() with untrusted input.",
                "line": node.lineno
            })

        self.generic_visit(node)


def analyze_python(code):

    try:
        tree = ast.parse(code)

    except SyntaxError as error:

        return {
            "success": False,
            "supported": True,
            "language": "python",
            "syntax_error": {
                "message": error.msg,
                "line": error.lineno
            },
            "issues": [],
            "summary": "Python syntax error detected."
        }

    analyzer = CodeAnalyzer()
    analyzer.visit(tree)

    return {
        "success": True,
        "supported": True,
        "language": "python",
        "syntax_error": None,
        "issues": analyzer.issues,
        "summary": (
            f"Analysis completed. Found {len(analyzer.issues)} issue(s)."
            if analyzer.issues
            else "No issues found by the basic Python analyzer."
        )
    }


# ==========================================
# JAVA ANALYZER
# ==========================================

class JavaAnalyzer:

    def __init__(self, code):

        self.code = code
        self.issues = []

    def add_issue(self, issue_type, message, line):

        self.issues.append({
            "type": issue_type,
            "message": message,
            "line": line
        })

    def analyze(self):

        lines = self.code.splitlines()

        for i, line in enumerate(lines, start=1):

            # String comparison
            if re.search(
                r'(["\']).*?\1\s*==|==\s*(["\']).*?\2',
                line
            ):

                self.add_issue(
                    "Bug",
                    "Avoid comparing Java strings using ==. Use .equals() instead.",
                    i
                )

            # Empty catch block
            if re.search(
                r'catch\s*\([^)]*\)\s*\{\s*\}',
                line
            ):

                self.add_issue(
                    "Code Quality",
                    "Empty catch block detected. Handle exceptions properly.",
                    i
                )

            # Hardcoded password
            if re.search(
                r'(password|passwd|secret)\s*=\s*"[^"]+"',
                line,
                re.IGNORECASE
            ):

                self.add_issue(
                    "Security",
                    "Avoid hardcoding passwords or secrets.",
                    i
                )

            # System.exit
            if "System.exit(" in line:

                self.add_issue(
                    "Code Quality",
                    "Avoid unnecessary System.exit() calls.",
                    i
                )

        return self.issues


# ==========================================
# C / C++ BASIC ANALYZER
# ==========================================

def analyze_cpp_c_quality(code):

    issues = []

    lines = code.splitlines()

    for i, line in enumerate(lines, start=1):

        # Dangerous functions
        dangerous_functions = [
            "gets(",
            "strcpy(",
            "strcat(",
            "sprintf("
        ]

        for function in dangerous_functions:

            if function in line:

                issues.append({
                    "type": "Security",
                    "message": (
                        f"Potentially unsafe function {function[:-1]}(). "
                        "Consider a safer alternative."
                    ),
                    "line": i
                })

        # Hardcoded credentials
        if re.search(
            r'(password|passwd|secret)\s*=\s*"[^"]+"',
            line,
            re.IGNORECASE
        ):

            issues.append({
                "type": "Security",
                "message": "Avoid hardcoding passwords or secrets.",
                "line": i
            })

        # Using gets
        if "gets(" in line:

            issues.append({
                "type": "Bug",
                "message": "gets() can cause buffer overflow. Use fgets() instead.",
                "line": i
            })

    return issues


# ==========================================
# COMPILER ANALYZER FOR JAVA
# ==========================================

def analyze_java(code):

    analyzer = JavaAnalyzer(code)
    issues = analyzer.analyze()

    compiler = shutil.which("javac")

    if not compiler:

        return {
            "success": False,
            "supported": True,
            "language": "java",
            "syntax_error": None,
            "issues": issues,
            "summary": (
                "Java basic analysis completed, but javac is not installed. "
                "Install JDK for compiler-based syntax checking."
            )
        }

    with tempfile.TemporaryDirectory() as temp_dir:

        temp_path = Path(temp_dir)

        class_match = re.search(
            r'\bpublic\s+(?:(?:abstract|final|sealed|non-sealed)\s+)*'
            r'(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)',
            code
        )

        class_name = (
            class_match.group(1)
            if class_match
            else "Main"
        )

        java_file = temp_path / f"{class_name}.java"

        java_file.write_text(code, encoding="utf-8")

        try:

            result = subprocess.run(
                [
                    compiler,
                    "-proc:none",
                    "-Xlint:all",
                    "-d",
                    str(temp_path),
                    str(java_file)
                ],
                capture_output=True,
                text=True,
                timeout=10
            )

        except subprocess.TimeoutExpired:

            raise HTTPException(
                status_code=408,
                detail="Java compilation timed out."
            )

        diagnostics = result.stderr.splitlines()

        for diagnostic in diagnostics:

            match = re.search(
                r':(\d+): (error|warning): (.*)',
                diagnostic
            )

            if match:

                line_number = int(match.group(1))
                severity = match.group(2)
                message = match.group(3)

                issues.append({
                    "type": (
                        "Compilation Error"
                        if severity == "error"
                        else "Compiler Warning"
                    ),
                    "message": message,
                    "line": line_number
                })

        errors = [
            issue for issue in issues
            if issue["type"] == "Compilation Error"
        ]

        return {
            "success": result.returncode == 0,
            "supported": True,
            "language": "java",
            "syntax_error": (
                {
                    "message": errors[0]["message"],
                    "line": errors[0]["line"]
                }
                if errors else None
            ),
            "issues": issues,
            "summary": (
                f"Java compilation failed. Found {len(errors)} compilation error(s)."
                if errors
                else f"Java analysis completed. Found {len(issues)} issue(s)."
                if issues
                else "Java compilation successful. No issues found."
            )
        }


# ==========================================
# COMPILER ANALYZER FOR C / C++
# ==========================================

def analyze_compiled_language(code, language):

    compiler_name = "gcc" if language == "c" else "g++"

    compiler = shutil.which(compiler_name)

    if not compiler:

        return {
            "success": False,
            "supported": True,
            "language": language,
            "syntax_error": None,
            "issues": analyze_cpp_c_quality(code),
            "summary": (
                f"{language.upper()} basic analysis completed, "
                f"but {compiler_name} is not installed. "
                "Install GCC/G++ for compiler-based syntax checking."
            )
        }

    issues = analyze_cpp_c_quality(code)

    with tempfile.TemporaryDirectory() as temp_dir:

        temp_path = Path(temp_dir)

        extension = ".c" if language == "c" else ".cpp"

        source_file = temp_path / f"main{extension}"

        source_file.write_text(code, encoding="utf-8")

        output_file = temp_path / (
            "program.exe" if shutil.which("g++" if language == "cpp" else "gcc")
            and __import__("os").name == "nt"
            else "program"
        )

        command = [
            compiler,
            "-Wall",
            "-Wextra",
            "-fsyntax-only",
            str(source_file)
        ]

        if language == "cpp":
            command.insert(1, "-std=c++17")
        else:
            command.insert(1, "-std=c11")

        try:

            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=10
            )

        except subprocess.TimeoutExpired:

            raise HTTPException(
                status_code=408,
                detail=f"{language.upper()} compilation timed out."
            )

        diagnostics = (
            result.stderr.splitlines()
            + result.stdout.splitlines()
        )

        for diagnostic in diagnostics:

            match = re.search(
                r':(\d+):\d+:\s*(fatal error|error|warning):\s*(.*)',
                diagnostic
            )

            if match:

                issues.append({
                    "type": (
                        "Compilation Error"
                        if "error" in match.group(2)
                        else "Compiler Warning"
                    ),
                    "message": match.group(3),
                    "line": int(match.group(1))
                })

        errors = [
            issue for issue in issues
            if issue["type"] == "Compilation Error"
        ]

        return {
            "success": result.returncode == 0,
            "supported": True,
            "language": language,
            "syntax_error": (
                {
                    "message": errors[0]["message"],
                    "line": errors[0]["line"]
                }
                if errors else None
            ),
            "issues": issues,
            "summary": (
                f"{language.upper()} compilation check failed. "
                f"Found {len(errors)} error(s)."
                if errors
                else f"{language.upper()} analysis completed. Found {len(issues)} issue(s)."
                if issues
                else f"{language.upper()} syntax check successful. No issues found."
            )
        }


# ==========================================
# API ROUTES
# ==========================================

@app.get("/")
def home():

    return {
        "message": "Welcome to CodeSense AI Code Reviewer",
        "supported_languages": [
            "python",
            "java",
            "c",
            "cpp"
        ]
    }


@app.get("/api/health")
def health_check():

    return {
        "status": "success",
        "message": "Backend is running successfully",
        "supported_languages": [
            "python",
            "java",
            "c",
            "cpp"
        ]
    }


@app.post("/api/analyze")
def analyze_code(request: AnalyzeRequest):

    code = request.code
    language = request.language.lower().strip()

    if not code.strip():

        raise HTTPException(
            status_code=400,
            detail="Please enter some code."
        )

    if language not in [
        "python",
        "java",
        "c",
        "cpp"
    ]:

        raise HTTPException(
            status_code=400,
            detail="Unsupported programming language."
        )

    if language == "python":
        return analyze_python(code)

    if language == "java":
        return analyze_java(code)

    if language in ["c", "cpp"]:
        return analyze_compiled_language(code, language)

    raise HTTPException(
        status_code=400,
        detail="Unsupported programming language."
    )
