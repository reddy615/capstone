from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.services.explanation_service import explain_fusion_result

router = APIRouter(prefix='/explain', tags=['explainability'])


@router.post('', status_code=status.HTTP_200_OK)
async def explain(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return explain_fusion_result(payload).model_dump(exclude_none=False)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - safety belt
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Explanation generation failed.') from exc