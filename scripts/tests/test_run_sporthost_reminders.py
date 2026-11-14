import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from scripts.run_sporthost_reminders import run, NoRedirect


class ReminderWorkerTests(unittest.TestCase):
    def config(self, directory, **changes):
        path = Path(directory)/'reminders.json'
        path.write_text(json.dumps({'origin':'https://sporthost.online','secret':'synthetic-secret-'*4,**changes}),encoding='utf8')
        return path

    def response(self, scanned, following):
        return io.BytesIO(json.dumps({'scanned':scanned,'next':following}).encode())

    def test_follows_pages_and_resets_the_durable_cursor(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.config(directory)
            opener=Mock();opener.open.side_effect=[self.response(100,200),self.response(3,None)]
            with patch('urllib.request.build_opener',return_value=opener),contextlib.redirect_stdout(io.StringIO()) as output:
                run(path)
            self.assertEqual(json.loads(path.with_suffix('.state.json').read_text()),{'after':0})
            self.assertEqual(json.loads(output.getvalue()),{'ok':True,'scanned':103,'scan_completed':True})
            calls=opener.open.call_args_list
            self.assertTrue(calls[1].args[0].full_url.endswith('after=200'))
            self.assertEqual(calls[0].args[0].get_method(),'POST')
            self.assertNotIn('secret',calls[0].args[0].full_url)

    def test_failed_page_keeps_last_completed_cursor_for_next_invocation(self):
        with tempfile.TemporaryDirectory() as directory:
            path=self.config(directory);opener=Mock();opener.open.side_effect=[self.response(100,123),TimeoutError()]
            with patch('urllib.request.build_opener',return_value=opener),self.assertRaises(TimeoutError):run(path)
            self.assertEqual(json.loads(path.with_suffix('.state.json').read_text()),{'after':123})
            opener.open.side_effect=[self.response(0,None)]
            with patch('urllib.request.build_opener',return_value=opener),contextlib.redirect_stdout(io.StringIO()):run(path)
            self.assertTrue(opener.open.call_args.args[0].full_url.endswith('after=123'))

    def test_rejects_untrusted_destinations_before_sending_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path=self.config(directory,origin='https://evil.example')
            with patch('urllib.request.build_opener') as network,self.assertRaises(ValueError):run(path)
            network.assert_not_called()

    def test_rejects_non_advancing_page_cursor(self):
        with tempfile.TemporaryDirectory() as directory:
            path=self.config(directory);opener=Mock();opener.open.return_value=self.response(100,0)
            with patch('urllib.request.build_opener',return_value=opener),self.assertRaises(ValueError):run(path)
            self.assertFalse(path.with_suffix('.state.json').exists())

    def test_refuses_redirects_with_bearer_credentials(self):
        self.assertIsNone(NoRedirect().redirect_request(None,None,302,'Found',{},'https://evil.example'))


if __name__=='__main__':unittest.main()
