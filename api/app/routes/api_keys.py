from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.exc import IntegrityError

from app.auth.dependencies import authorize_route, get_principal
from app.auth.principal import Principal
from app.database import async_session_maker
from app.repos.api_keys import list_for_client, revoke
from app.repos.errors import ApiKeyNotFoundError
from app.services.api_keys import generate_api_key

router = APIRouter(
    prefix="/api/keys",
    tags=["api_keys"],
    dependencies=[Depends(authorize_route)],
)


class ApiKeyCreateRequest(BaseModel):
    client_id: str
    name: str
    scopes: list[str] = []
    expires_at: datetime | None = None


class ApiKeyCreateResponse(BaseModel):
    id: str
    client_id: str
    name: str
    key_prefix: str
    raw_key: str  # Only returned once
    scopes: list[str]
    expires_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApiKeyResponse(BaseModel):
    id: str
    client_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    expires_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None
    last_used_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ApiKeyListResponse(BaseModel):
    keys: list[ApiKeyResponse]


@router.post("", response_model=ApiKeyCreateResponse, status_code=201)
async def create_api_key(
    request: ApiKeyCreateRequest,
    principal: Annotated[Principal, Depends(get_principal)],
):
    async with async_session_maker() as session:
        try:
            api_key, raw_key = await generate_api_key(
                session=session,
                client_id=request.client_id,
                name=request.name,
                scopes=request.scopes,
                expires_at=request.expires_at,
            )
            await session.commit()

            return ApiKeyCreateResponse(
                id=api_key.id,
                client_id=api_key.client_id,
                name=api_key.name,
                key_prefix=api_key.key_prefix,
                raw_key=raw_key,
                scopes=api_key.scopes,
                expires_at=api_key.expires_at,
                created_at=api_key.created_at,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=400,
                detail="Failed to create API key. Check if client exists.",
            )


@router.get("", response_model=ApiKeyListResponse)
async def list_api_keys(
    client_id: str = Query(..., description="The client ID to list keys for"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: Annotated[Principal, Depends(get_principal)] = None,
):
    async with async_session_maker() as session:
        try:
            keys = await list_for_client(
                session=session,
                client_id=client_id,
                limit=limit,
                offset=offset,
            )
            return ApiKeyListResponse(
                keys=[ApiKeyResponse.model_validate(k) for k in keys]
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{key_id}", response_model=ApiKeyResponse)
async def revoke_api_key(
    key_id: str,
    principal: Annotated[Principal, Depends(get_principal)] = None,
):
    async with async_session_maker() as session:
        try:
            api_key = await revoke(session, key_id)
            await session.commit()
            return ApiKeyResponse.model_validate(api_key)
        except ApiKeyNotFoundError:
            raise HTTPException(status_code=404, detail="API key not found")
