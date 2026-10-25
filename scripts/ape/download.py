"""Fetch the pinned official SDK without persisting partial or unverified content."""
import hashlib
import time
import urllib.error
import urllib.request

SDK_URL = 'https://monkeysaudio.com/files/MAC_1343_SDK.zip'
SDK_SHA256 = '3fd1c60f994daba536902f30b1bebc2235099c8b8a039d8b37d9d27d4827e0ca'
MAX_BYTES = 8 * 1024 * 1024
HEADERS = {
    'User-Agent': 'music-trance-source-build/1.0 (official SDK source verification)',
    'Accept': 'application/zip, application/octet-stream;q=0.9, */*;q=0.5',
}
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


def fetch_sdk(destination, *, opener=urllib.request.urlopen, sleep=time.sleep):
    """At most three attempts, only transient transport/server errors retried."""
    for attempt in range(3):
        try:
            request = urllib.request.Request(SDK_URL, headers=HEADERS)
            with opener(request, timeout=120) as response:
                if response.geturl() != SDK_URL:
                    raise ValueError('Unexpected SDK redirect; refusing unverified destination')
                payload = response.read(MAX_BYTES + 1)
            if len(payload) > MAX_BYTES:
                raise ValueError('Official SDK download exceeds size bound')
            if hashlib.sha256(payload).hexdigest() != SDK_SHA256:
                raise ValueError('SDK checksum mismatch; refusing downloaded content')
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(destination.suffix + '.part')
            try:
                temporary.write_bytes(payload)
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
            return
        except urllib.error.HTTPError as error:
            # Authentication, denial, challenge and representation errors are not retried.
            if error.code not in RETRYABLE_STATUS or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        sleep(2 ** attempt)
