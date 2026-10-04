from fastapi import APIRouter, Depends

from app import database
from app.auth.dependencies import authorize_route
from app.repos.audit import get_metrics_summary

router = APIRouter(
    prefix="/api/metrics",
    tags=["metrics"],
    dependencies=[Depends(authorize_route)],
)


@router.get("/summary")
async def metrics_summary() -> dict:
    async with database.async_session_maker() as session:
        return await get_metrics_summary(session)
