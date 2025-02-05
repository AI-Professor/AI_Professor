from PyPDF2 import PdfReader  
import warnings
warnings.filterwarnings("ignore")

#This function will take a .pdf file as input and extract all text content from it
def extract_text_from_pdf(pdf_path: str) -> str:  
    text = ""  
    reader = PdfReader(pdf_path)  
    for page in reader.pages:  
        text += page.extract_text()  
    return text 