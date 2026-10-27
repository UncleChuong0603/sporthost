"""Image validation and private durable object storage."""
import hashlib
import io
import os
import secrets
import warnings
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

LOCAL_ROOT = Path(__file__).resolve().parents[1] / '.vercel' / 'uploads'
Image.MAX_IMAGE_PIXELS = 16_000_000


def sanitize_image(upload: UploadFile, *, limit=2*1024*1024):
    raw = upload.file.read(limit+1)
    if not raw or len(raw) > limit:
        raise HTTPException(400, 'Ảnh vượt dung lượng cho phép hoặc file rỗng')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in ('PNG','JPEG','WEBP'):
                    raise ValueError('Unsupported format')
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
    return bool(os.getenv('BLOB_READ_WRITE_TOKEN') or os.getenv('BLOB_STORE_ID'))


def put_image(data:bytes,club_id:int,kind:str):
    if kind not in ('qr','proof'):raise ValueError('Unsupported asset kind')
    key=f'clubs/{club_id}/{kind}/{secrets.token_urlsafe(24)}.png'
    if use_blob():
        from vercel.blob import sync as blob
        blob.put_blob(key,data,access='private',content_type='image/png',add_random_suffix=False)
    elif os.getenv('VERCEL')=='1' or os.getenv('APP_ENV') in ('production','staging'):
        raise HTTPException(503,'Tạm thời chưa thể lưu ảnh. Vui lòng thử lại sau.')
    else:
        path=local_path(key);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    return key,hashlib.sha256(data).hexdigest()


def get_image(key):
    if use_blob():
        from vercel.blob import sync as blob
        return blob.get_blob(key,access='private').body
    return local_path(key).read_bytes()


def delete_image(key):
    if use_blob():
        from vercel.blob import sync as blob
        blob.delete_blob(key)
    else:local_path(key).unlink(missing_ok=True)
