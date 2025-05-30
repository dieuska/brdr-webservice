FROM python:3
#ADD index.html index.html
RUN python -m pip install --upgrade pip
RUN python -m pip install fastapi uvicorn brdr==0.10.0 shapely pydantic geojson_pydantic
ADD grb_webservice.py grb_webservice.py
ADD grb_webservice_typings.py grb_webservice_typings.py
EXPOSE 80
ENTRYPOINT ["python3", "grb_webservice.py"]