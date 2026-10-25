import io
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
import download


class Response(io.BytesIO):
    def geturl(self):return download.SDK_URL


class FetchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.dest=Path(self.temp.name)/'sdk.zip';self.requests=[]
    def valid(self, request, **kwargs):
        self.requests.append(request)
        return Response(b'valid synthetic test archive')
    def good_hash(self):
        return patch.object(download,'SDK_SHA256',download.hashlib.sha256(b'valid synthetic test archive').hexdigest())
    def test_verified_atomic_download_and_headers(self):
        with self.good_hash():download.fetch_sdk(self.dest,opener=self.valid)
        self.assertEqual(self.dest.read_bytes(),b'valid synthetic test archive')
        self.assertEqual(self.requests[0].full_url,download.SDK_URL)
        self.assertEqual(self.requests[0].get_header('User-agent'),download.HEADERS['User-Agent'])
        self.assertIn('application/zip',self.requests[0].get_header('Accept'))
        self.assertFalse(self.dest.with_suffix('.zip.part').exists())
    def test_hash_failure_not_written_or_retried(self):
        with self.assertRaisesRegex(ValueError,'checksum'):download.fetch_sdk(self.dest,opener=self.valid)
        self.assertFalse(self.dest.exists());self.assertEqual(len(self.requests),1)
    def test_transient_retry_is_bounded(self):
        calls=[];delays=[]
        def fail(req,**kw):
            calls.append(req);raise urllib.error.HTTPError(download.SDK_URL,503,'Unavailable',{},None)
        with self.assertRaises(urllib.error.HTTPError):download.fetch_sdk(self.dest,opener=fail,sleep=delays.append)
        self.assertEqual(len(calls),3);self.assertEqual(delays,[1,2]);self.assertFalse(self.dest.exists())
    def test_406_not_retried(self):
        calls=[]
        def fail(req,**kw):
            calls.append(req);raise urllib.error.HTTPError(download.SDK_URL,406,'Not Acceptable',{},None)
        with self.assertRaises(urllib.error.HTTPError):download.fetch_sdk(self.dest,opener=fail,sleep=lambda _:self.fail('must not retry'))
        self.assertEqual(len(calls),1)
    def test_transient_then_success(self):
        calls=[]
        def flaky(req,**kw):
            calls.append(req)
            if len(calls)==1:raise urllib.error.URLError('temporary transport failure')
            return self.valid(req,**kw)
        with self.good_hash():download.fetch_sdk(self.dest,opener=flaky,sleep=lambda _:None)
        self.assertEqual(len(calls),2);self.assertTrue(self.dest.exists())
    def test_size_bound(self):
        with patch.object(download,'MAX_BYTES',2),self.assertRaisesRegex(ValueError,'size bound'):
            download.fetch_sdk(self.dest,opener=self.valid)
        self.assertFalse(self.dest.exists())
    def test_redirect_rejected(self):
        class Redirect(Response):
            def geturl(self):return 'https://example.invalid/sdk.zip'
        with self.assertRaisesRegex(ValueError,'redirect'):
            download.fetch_sdk(self.dest,opener=lambda *a,**k:Redirect(b'x'))
        self.assertFalse(self.dest.exists())

if __name__=='__main__':unittest.main()
