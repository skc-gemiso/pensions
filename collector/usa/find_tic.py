import sys; sys.path.insert(0, ".")
import requests

# Try current TIC publication paths
urls = [
    "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/mfh.txt",
    "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/shl2023r.zip",
    "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/shl2024r.zip",
    "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/shl2025r.zip",
    # Newer paths
    "https://home.treasury.gov/data/treasury-international-capital-tic-system/tic-forms-and-instructions/tic-b-forms-portfolio-holdings-of-us-and-foreign-securities/tic-b-data-files",
]
for url in urls:
    try:
        r = requests.get(url, timeout=15)
        print(f"{url.split('/')[-1]}: {r.status_code} {len(r.content)} bytes")
        if r.status_code == 200 and len(r.content) < 200:
            print("  content:", r.text[:100])
    except Exception as e:
        print(f"{url.split('/')[-1]}: {str(e)[:50]}")
