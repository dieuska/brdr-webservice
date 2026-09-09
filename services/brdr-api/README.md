# BRDR API

FastAPI service exposing the BRDR alignment endpoint. The service also serves
the compiled viewer bundle when it is packaged through the repository Dockerfile.

Run locally from the repository root:

```powershell
python services/brdr-api/brdr_webservice.py
```

Run the tests from this directory:

```powershell
python -m unittest discover -s tests -p "test_*.py"
```
