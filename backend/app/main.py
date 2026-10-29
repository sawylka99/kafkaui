from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import connections, preferences, produce, topics

app = FastAPI(title="Kafka UI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connections.router)
app.include_router(topics.router)
app.include_router(produce.router)
app.include_router(preferences.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
