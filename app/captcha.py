import random
import string
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from cachetools import TTLCache
import uuid

captcha_store = TTLCache(maxsize=1000, ttl=300)


def generate_captcha_image():
    text = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    img = Image.new('RGB', (200, 60), color=(243, 244, 246))
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("arial.ttf", 36)
    except:
        font = ImageFont.load_default()

    # 干扰线
    for _ in range(8):
        x1, y1 = random.randint(0, 200), random.randint(0, 60)
        x2, y2 = random.randint(0, 200), random.randint(0, 60)
        draw.line([(x1, y1), (x2, y2)],
                  fill=(random.randint(100, 200), random.randint(100, 200), random.randint(100, 200)),
                  width=2)

    # 文字
    for i, char in enumerate(text):
        x = 20 + i * 30 + random.randint(-3, 3)
        y = 10 + random.randint(-5, 5)
        draw.text((x, y), char, font=font, fill=(0, 0, 0))

    byte_io = BytesIO()
    img.save(byte_io, 'PNG')
    return byte_io.getvalue(), text


def get_captcha():
    image_bytes, text = generate_captcha_image()  # 这里已经获取的是bytes类型
    captcha_id = str(uuid.uuid4())
    captcha_store[captcha_id] = text.lower()

    return {
        "captcha_id": captcha_id,
        "image": image_bytes
    }

def verify_captcha(captcha_id, user_input):
    # Return False if captcha expired or not found.
    expected = captcha_store.get(captcha_id)
    if expected is None:
        return False
    return expected == user_input.lower()

