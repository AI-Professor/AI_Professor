import json
import sqlite3
from src.data_ingestion.text_splitter import split_text
import pandas as pd

class BasicQuizEngine:
    def __init__(self, db, llm):
        self.knowledge_graph = db
        self.llm = llm
        self.conn = sqlite3.connect('data/processed/quiz_data.db')
        self._init_db()

    def _init_db(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY, 
                question TEXT,
                options TEXT,
                answer INTEGER,
                concept TEXT
            )
        ''')
        self.conn.commit()
    
    def generate_quiz_from_script(self, script_path: str, num_questions=10):        
        with open(script_path) as f:
            script = f.read()
            
        chunks = split_text(script)
        if len(chunks) < num_questions:
            print(f"There is not enough material to generate {num_questions} questions. Please try again!")
            print(f"The material is only enough to generate {len(chunks)} questions.")
            return
        
        for chunk in chunks[:num_questions]:
            prompt = f"""Generate a multiple choice question from this text:
            {chunk}
            
            Format as JSON:
            {{
                "question": "...",
                "options": ["...", "...", "...", "..."],
                "answer": 0,
                "concept": "..."
            }}"""
            
            response = self.llm.predict(prompt)
            try:
                question = json.loads(response)
                self._store_question(question)
            except:
                continue

    def _store_question(self, question: dict):
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO questions (question, options, answer, concept)
            VALUES (?, ?, ?, ?)
        ''', (
            question['question'],
            json.dumps(question['options']),
            question['answer'],
            question['concept']
        ))
        self.conn.commit()

    def print_all_questions(self):
        """Print all questions in a readable format"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM questions")
        questions = cursor.fetchall()
        
        print("\n" + "="*50)
        print(f"Found {len(questions)} questions in database:")
        print("="*50)
        
        for idx, question in enumerate(questions, 1):
            print(f"\nQuestion #{idx}")
            print(f"ID: {question[0]}")
            print(f"Question: {question[1]}")
            print(f"Options: {json.loads(question[2])}")
            print(f"Correct Answer: {question[3]}")
            print(f"Concept: {question[4]}")
            print("-"*50)
    
    def clear_all_questions(self):
        """Clear all questions from the database"""
        cursor = self.conn.cursor()
        
        try:
            # Delete all records
            cursor.execute("DELETE FROM questions")
            
            # Only reset sequence if table exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")
            if cursor.fetchone():
                cursor.execute("DELETE FROM sqlite_sequence WHERE name='questions'")
            
            self.conn.commit()
            print("Successfully cleared all quiz questions!")
        
        except sqlite3.Error as e:
            print(f"Error clearing questions: {str(e)}")
        
        finally:
            # Optional: Only vacuum if you need to reclaim space
            # cursor.execute("VACUUM")
            pass