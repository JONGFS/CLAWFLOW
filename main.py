import os

from fastapi import FastAPI


app = FastAPI(
    title="ClawFlow API",
    version="0.1.0",
    description="Minimal API scaffold for deployment.",
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "ClawFlow API is running"}


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
