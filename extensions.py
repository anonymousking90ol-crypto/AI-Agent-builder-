"""
Shared Flask extension instances (avoids circular imports).
"""
from flask_login import LoginManager
from flask_cors import CORS

login_manager = LoginManager()
cors = CORS()
