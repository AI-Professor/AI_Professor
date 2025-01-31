from src.data_ingestion.pdf_parser import extract_text_from_pdf  
from src.data_ingestion.text_splitter import split_text  
from src.nlp.qa_system import initialize_qa_system, answer_question  
import warnings

warnings.filterwarnings("ignore")

def main():  
    # Ingest the book chapter  
    text = extract_text_from_pdf("data/raw/book.pdf")  
    chunks = split_text(text)  
    db = initialize_qa_system(chunks)  

    # Interactive Q&A loop  
    print("AI Professor is ready! Ask a question (type 'exit' to quit):")  
    while True:  
        question = input("\nYou: ")  
        if question.lower() == "exit":  
            break  
        answer = answer_question(question, db)  
        print(f"\nAI Professor: {answer}")  

if __name__ == "__main__":  
    main()  