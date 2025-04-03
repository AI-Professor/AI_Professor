import os
import json
import warnings
import re
import shutil
import concurrent.futures
from PyPDF2 import PdfReader
from google.cloud import storage
from google.oauth2 import service_account
from magic_pdf.data.data_reader_writer import FileBasedDataWriter, FileBasedDataReader
from magic_pdf.data.dataset import PymuDocDataset
from magic_pdf.model.doc_analyze_by_custom_model import doc_analyze
from magic_pdf.config.enums import SupportedPdfParseMethod

warnings.filterwarnings("ignore")

# Path to Service Account JSON Key

GCS_CREDENTIALS_PATH = "FigureFetchingKey.json"

# Google Cloud Storage Configuration (Private Bucket Access)
BUCKET_NAME = "ai_professor_uploaded_figures"

# Authenticate using the service account with the custom role
credentials = service_account.Credentials.from_service_account_file(GCS_CREDENTIALS_PATH)
storage_client = storage.Client(credentials=credentials)
bucket = storage_client.bucket(BUCKET_NAME)

def delete_directories(*directories):
    """Deletes the specified directories and their contents."""
    for directory in directories:
        if os.path.exists(directory):
            shutil.rmtree(directory)

def upload_to_gcs(local_path, gcs_path):
    """Uploads a file to Google Cloud Storage (private bucket) and returns the URL."""
    blob = bucket.blob(gcs_path)
    blob.upload_from_filename(local_path)
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{gcs_path}"

def process_pdf(pdf_file_name: str) -> str:
    """Processes the PDF, uploads images to private GCS, and returns Markdown text."""
    
    name_without_suff = os.path.splitext(os.path.basename(pdf_file_name))[0]

    # Prepare Output Directories
    local_image_dir, local_md_dir = f"../../data/raw/{name_without_suff}/images", f"../../data/raw/{name_without_suff}"
    os.makedirs(local_image_dir, exist_ok=True)
    image_dir = str(os.path.basename(local_image_dir))
    md_dir = str(os.path.basename(local_md_dir))
    image_writer, md_writer = FileBasedDataWriter(local_image_dir), FileBasedDataWriter(local_md_dir)

    # Read PDF Bytes
    reader1 = FileBasedDataReader("")
    pdf_bytes = reader1.read(pdf_file_name)

    # Process PDF
    ds = PymuDocDataset(pdf_bytes)
    if ds.classify() == SupportedPdfParseMethod.OCR:
        infer_result = ds.apply(doc_analyze, ocr=True)
        pipe_result = infer_result.pipe_ocr_mode(image_writer)
    else:
        infer_result = ds.apply(doc_analyze, ocr=False)
        pipe_result = infer_result.pipe_txt_mode(image_writer)

    # Upload Images to Private GCS in Parallel
    image_urls = {}
    image_files = os.listdir(local_image_dir)

    def upload_image(image_file):
        """Uploads a single image file and returns its GCS URL."""
        local_image_path = os.path.join(local_image_dir, image_file)
        gcs_image_path = f"{name_without_suff}/{image_file}"
        return image_file, upload_to_gcs(local_image_path, gcs_image_path)

    with concurrent.futures.ThreadPoolExecutor() as executor:
        results = executor.map(upload_image, image_files)
    
    # Collect all uploaded image URLs
    image_urls = {image_file: url for image_file, url in results}

    # Get Markdown Content
    md_content = pipe_result.get_markdown(image_dir)

    # Optimized: Replace Local Image Paths with GCS URLs using Regex
    def replace_image_urls(match):
        """Replace image paths with corresponding GCS URLs."""
        image_file = match.group(1)
        return image_urls.get(image_file, match.group(0))  # If no match, keep the original

    md_content = re.sub(r"\bimages/([^)\s]+)", replace_image_urls, md_content)

    delete_directories(local_image_dir, local_md_dir)

    return md_content