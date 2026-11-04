"""Image validation and private durable object storage."""
import hashlib
import io
import os
import secrets
import warnings
import tempfile
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

LOCAL_ROOT = Path(__file__).resolve().parents[1] / '.vercel' / 'uploads'
if os.getenv('STORAGE_ROOT'):
    LOCAL_ROOT = Path(os.environ['STORAGE_ROOT']).resolve()
elif os.getenv('APP_ENV') in ('test','development') and os.getenv('SPORTHOST_LOCAL_UPLOAD_DIR'):
    LOCAL_ROOT=Path(os.environ['SPORTHOST_LOCAL_UPLOAD_DIR']).resolve()
Image.MAX_IMAGE_PIXELS = 16_000_000


def sanitize_image(upload: UploadFile, *, limit=2*1024*1024):
    allowed={'image/png':'PNG','image/jpeg':'JPEG','image/webp':'WEBP'}
    if upload.content_type not in allowed:raise HTTPException(400,'Chỉ nhận MIME ảnh PNG, JPEG hoặc WebP')
    raw = upload.file.read(limit+1)
    if not raw or len(raw) > limit:
        raise HTTPException(400, 'Ảnh vượt dung lượng cho phép hoặc file rỗng')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in ('PNG','JPEG','WEBP'):
                    raise ValueError('Unsupported format')
                if image.format!=allowed[upload.content_type]:raise ValueError('Image content and MIME differ')
                image.verify()
            with Image.open(io.BytesIO(raw)) as image:
                image.load()
                image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
                image.thumbnail((1600,1600))
                output=io.BytesIO()
                image.save(output,format='PNG',optimize=True)
                data=output.getvalue()
                if len(data)>3*1024*1024:raise ValueError('Image too large after conversion')
                return data
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400,'Chỉ nhận ảnh PNG, JPEG hoặc WebP hợp lệ; vui lòng chọn ảnh nhỏ hơn')


def local_path(key):
    path=(LOCAL_ROOT/key).resolve()
    if not path.is_relative_to(LOCAL_ROOT.resolve()):raise ValueError('Invalid storage path')
    return path


def use_blob():
    backend = os.getenv('STORAGE_BACKEND', 'auto').lower()
    if backend not in ('auto', 'blob', 'local'):
        raise RuntimeError('STORAGE_BACKEND must be auto, blob or local')
    return backend == 'blob' or (backend == 'auto' and bool(os.getenv('BLOB_READ_WRITE_TOKEN') or os.getenv('BLOB_STORE_ID')))


def require_local_storage():
    if os.getenv('VERCEL') == '1':
        raise HTTPException(503, 'Persistent storage unavailable')
    if os.getenv('APP_ENV') in ('production', 'staging'):
        root = os.getenv('STORAGE_ROOT', '')
        if (os.getenv('STORAGE_BACKEND') != 'local' or not root or not Path(root).is_absolute()
                or not LOCAL_ROOT.is_dir() or not os.access(LOCAL_ROOT, os.W_OK | os.R_OK)):
            raise HTTPException(503, 'Persistent storage unavailable')


def put_image(data:bytes,club_id:int,kind:str):
    if kind not in ('qr','proof'):raise ValueError('Unsupported asset kind')
    key=f'clubs/{club_id}/{kind}/{secrets.token_urlsafe(24)}.png'
    if use_blob():
        from vercel.blob import sync as blob
        blob.put_blob(key,data,access='private',content_type='image/png',add_random_suffix=False)
    else:
        require_local_storage()
        path=local_path(key);path.parent.mkdir(parents=True,exist_ok=True)
        # Same-filesystem replacement prevents partially written images after restart.
        temp = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
                temp = Path(handle.name)
                handle.write(data);handle.flush();os.fsync(handle.fileno())
            os.replace(temp, path)
        finally:
            if temp is not None:temp.unlink(missing_ok=True)
    return key,hashlib.sha256(data).hexdigest()


def get_image(key):
    if use_blob():
        from vercel.blob import sync as blob
        return blob.get_blob(key,access='private').body
    require_local_storage()
    return local_path(key).read_bytes()


def delete_image(key):
    if use_blob():
        from vercel.blob import sync as blob
        blob.delete_blob(key)
    else:
        require_local_storage()
        local_path(key).unlink(missing_ok=True)
