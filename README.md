# AI_Professor

# Setup
Step 1: Clone the repository to your computer
git clone <your-repo-url>
cd <your-repo-folder>

Step 2: Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

Step 3: Install all dependencies from requirements.txt
pip install -r requirements.txt

Step 4: Install all node modules
npm install

Step 5: Register accounts for OPENAI, ELEVENLABS, and D-ID. Get the API keys from the website after registration. Create a ".env" file at the root folder. Setup key as "OPENAI_API_KEY="your key"" form.

Step 6: Create a file at the root folder called "api.json" and put the following script in there:
{
    "key": "your D-ID API key",
    "url": "https://api.d-id.com",
    "service": "talks"
}

# Get to know the project 
Step 1: 
Start with AI_Professor/main.py, here is the backend main execution file. We compile and run all of the backend functions in this file as a prototype or a model.

Step 2: 
Then go to AI_Professor/app.js, here is the frontend main execution file. All of our endpoints at frontend are setup here. We also execute this file at frontend.

Step 3:
If you have any question about any of the function used in main.py or app.js, you can follow the Folder Directions below to see the detail of the implementations of each function. 

Step 4:
After all of the steps above is done, you can now go on and try the project out. You need to open two different terminal windows. Go to our root directory in both windows. One of them you want to run source venv/bin/activate for macOS/Linux or venv\Scripts\activate for Windows, then do python main.py, now our backend server start working. Then you want to do npm run dev or npm start in the other window, now our frontend server start working. Finally, open any browser in your computer and go to localhost:3000/agents and enjoy it!
Our backend API will be running on localhost:5001 and our frontend API will be running on localhost:3000.

# Folder Directions
├── *README.md*                     # Project overview, setup instructions
├── *main.py*                       # Primary entry point 
├── *app.js*                        # New Express server (for D-ID web interface)
├── *.env*                          # Store API keys (OpenAI,ElevenLabs,D-ID) for backend *check setup step 5*
├── *api.json*                      # Store API keys (D-ID) for frontend *check setup step 6*
├── venv                            # Python virtual environment *appear after setup step 2*
├── requirements.txt                # Python dependencies *for setup step 3*
├── node_modules/                   # Auto-generated *appear after setup step 4*
├── package.json                    # Node.js dependencies with minimum version
├── package-lock.json               # Node.js dependencies with exact version
├── .gitignore                      # Excludes secrets, logs, virtualenv
│  
├── data/                           # Raw and processed data  
│   ├── raw/                        # Original input files (PDFs, EPUBs, videos)  
│   │   ├── book_chapter.pdf
│   │   ├── scrum.epub
│   │   └── python_tutorial.mp4      
│   │  
│   └── processed/                  # Cleaned and structured data  
│       ├── lesson_script/          # Lecture scripts
│       │   └── lesson_script.txt 
│       ├── audio/                  # Lecture and Q&A audio
│       │   └── audio.mp3
│       ├── quiz_data/              # Quiz database
│       │   └── quiz_data.db
│       └── knowledge_graph/        # Vector database (FAISS)  
│           ├── index.faiss  
│           └── index.pkl  
│  
├── src/                            # Source code  
│   ├── data_ingestion/             # Text processing scripts  
│   │   ├── pdf_parser.py           # Extracts text from PDFs  
│   │   ├── epub_parser.py          # Extracts text from epubs 
│   │   ├── video_parser.py         # Extracts text from videos  
│   │   └── text_splitter.py        # Splits text into sections  
│   │  
│   ├── nlp/                        # NLP and AI components  
│   │   ├── qa_system.py            # GPT-4 Q&A with LangChain  
│   │   └── quiz_system.py          # Quiz generation machine using OpenAI and SQLite3
│   │  
│   ├── avatar/                     # Avatar management  
│   │   ├── avatar_design/          # 2D avatar assets (images, animations)  
│   │   ├── lip_sync.py             # D-ID integration for lip-syncing
│   │   ├── script_generator.py     # Lecture script generator using input materials
│   │   ├── tts.py                  # Transform text to audio speech   
│   │  
│   └── utils/                      # Helper functions  
│       ├── config_loader.py        # Loads environment variables  
│       └── logger.py               # Logging setup  
│ 
├── public/                         # Frontend files
│   ├── index-agents.html           # Agent HTML
│   ├── assets/
│   │    ├── idle/                  # Idle videos
│   │    └── bg.png                 # Background image 
│   ├── styles/                     # Frontend styling
│   │   └── style-agents.css
│   └── scripts/            
│       ├── voice-ui.js             # Voice recognition
│       └── agents-client-api.js    # Frontend Agent
│  
├── tests/                          # Unit and integration tests  
│   ├── test_data_ingestion.py  
│   └── test_quiz.py  
│  
├── notebooks/                      # Experimental Jupyter notebooks  
│   └── prototype_testing.ipynb     # Early-stage concept validation  
│  
├── scripts/                        # Utility scripts (e.g., backups)  
│   └── backup_data.sh  
│  
├── logs/                           # Log files (errors, API calls)  
│   └── app.log  
│ 
├── backups/                        # Backups generated by backup_data.sh