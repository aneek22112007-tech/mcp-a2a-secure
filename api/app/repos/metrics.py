import logging

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_events import AuditEvent
from app.rate_limit import limiter

logger = logging.getLogger(__name__)


async def get_metrics_summary(session: AsyncSession) -> dict:
    result = {
        "database": {"available": True, "error": None},
        "totals": {},
        "slowest_tools": [],
        "busiest_keys": [],
        "in_process_limiter": {
            "active_buckets": len(limiter._buckets),
        },
    }

    try:
        totals_stmt = select(
            func.count().label("total"),
            func.count(case((AuditEvent.status == "ok", 1))).label("successful"),
            func.count(case((AuditEvent.status == "denied", 1))).label("denied"),
            func.count(case((AuditEvent.status == "error", 1))).label("error"),
            func.count(case((AuditEvent.reason == "rate_limit_exceeded", 1))).label(
                "rate_limit_rejections"
            ),
        ).select_from(AuditEvent)

        totals_res = await session.execute(totals_stmt)
        totals_row = totals_res.one()
        result["totals"] = {
            "total": totals_row.total or 0,
            "successful": totals_row.successful or 0,
            "denied": totals_row.denied or 0,
            "error": totals_row.error or 0,
            "rate_limit_rejections": totals_row.rate_limit_rejections or 0,
        }

        slowest_stmt = (
            select(
                AuditEvent.tool_name,
                func.count().label("request_count"),
                func.avg(AuditEvent.duration_ms).label("avg_duration_ms"),
                func.max(AuditEvent.duration_ms).label("max_duration_ms"),
            )
            .where(AuditEvent.tool_name.is_not(None))
            .where(AuditEvent.duration_ms.is_not(None))
            .group_by(AuditEvent.tool_name)
            .order_by(func.avg(AuditEvent.duration_ms).desc())
            .limit(10)
        )
        slowest_res = await session.execute(slowest_stmt)
        result["slowest_tools"] = [
            {
                "tool_name": row.tool_name,
                "request_count": row.request_count,
                "avg_duration_ms": round(row.avg_duration_ms, 2)
                if row.avg_duration_ms
                else 0.0,
                "max_duration_ms": round(row.max_duration_ms, 2)
                if row.max_duration_ms
                else 0.0,
            }
            for row in slowest_res.all()
        ]

        busiest_stmt = (
            select(
                AuditEvent.key_prefix,
                func.count().label("request_count"),
            )
            .where(AuditEvent.key_prefix.is_not(None))
            .group_by(AuditEvent.key_prefix)
            .order_by(func.count().desc())
            .limit(10)
        )
        busiest_res = await session.execute(busiest_stmt)
        result["busiest_keys"] = [
            {
                "key_prefix": row.key_prefix,
                "request_count": row.request_count,
            }
            for row in busiest_res.all()
        ]

    except Exception:
        logger.exception("Failed to query metrics from database")
        result["database"]["available"] = False
        result["database"]["error"] = "unavailable"

    return result
