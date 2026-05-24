from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import requests

http_retry = retry(
    retry=retry_if_exception_type((requests.Timeout, requests.ConnectionError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
