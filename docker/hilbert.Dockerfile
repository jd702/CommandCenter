FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir flask flask-cors numpy

COPY flask/server.py /app/server.py

EXPOSE 5000

CMD ["python", "server.py"]
