from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.fusion_routes import router as fusion_router
from app.routes.explanation_routes import router as explanation_router
from app.routes.image_predict import router as image_predict_router
from app.routes.predict import router as predict_router

app = FastAPI(
    title="ReliefLink NLP Service",
    version="0.1.0",
    description="Emergency text classification for Fire, Flood, and Accident classes.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(predict_router, prefix='/api/v1')
app.include_router(image_predict_router, prefix='/api/v1')
app.include_router(fusion_router, prefix='/api/v1')
app.include_router(explanation_router, prefix='/api/v1')


@app.get('/health')
async def health() -> dict:
    return {
        'status': 'ok',
        'service': 'ReliefLink NLP Service',
        'version': '0.1.0',
    }
