from fastapi import FastAPI
from Trading import app4_router
from simulation import app5_router
import uvicorn
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(app4_router)
app.include_router(app5_router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

# '''Main FastAPI application entry point
# Modified to include Botpress webhook endpoints'''
# from fastapi import FastAPI
# from Trading import app4_router
# from simulation import app5_router
# from botpress_webhook import botpress_router
# from trading_endpoints import trading_router
# import uvicorn
# from fastapi.middleware.cors import CORSMiddleware

# app = FastAPI()
# # Enable CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # In production, replace with specific origins
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Include your existing routers
# app.include_router(app4_router)
# app.include_router(app5_router)

# # Include new routers for Botpress integration
# app.include_router(botpress_router)
# app.include_router(trading_router)

# # Root endpoint
# @app.get("/")
# async def root():
#     return {
#         "status": "online",
#         "message": "Trading API with Botpress integration is running",
#         "docs": "/docs"
#     }

# if __name__ == "__main__":
#     uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)