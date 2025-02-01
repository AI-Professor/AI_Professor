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

# Get to know the project 
Step 1: 
Start with AI_Professor/main.py, here is the main execution file. We compile and run all of the functions in this file as a prototype or a model.

Step 2:
If you have any question about any of the function used in main.py, you can follow the Folder Directions below to see the detail of the implementations of each function. 

# Folder Directions
├── .env                        # Stores API keys (OpenAI, ElevenLabs, D-ID)  
├── requirements.txt            # Python dependencies  
├── README.md                   # Project overview, setup instructions  
├── main.py                     # Entry point for the prototype  
├── setup.py                    # Installation script (optional)  
├── .gitignore                  # Excludes secrets, logs, virtualenv  
│  
├── data/                       # Raw and processed data  
│   ├── raw/                    # Original files (PDFs, EPUBs)  
│   │   └── book_chapter.pdf    # Your test book/chapter  
│   │  
│   └── processed/              # Cleaned and structured data  
│       ├── chapter.txt         # Extracted text from the chapter  
│       └── knowledge_graph/    # Vector database (FAISS)  
│           ├── index.faiss  
│           └── index.pkl  
│  
├── src/                        # Source code  
│   ├── data_ingestion/         # Text processing scripts  
│   │   ├── pdf_parser.py       # Extracts text from PDFs  
│   │   └── text_splitter.py    # Splits text into sections  
│   │  
│   ├── nlp/                    # NLP and AI components  
│   │   ├── qa_system.py        # GPT-4 Q&A with LangChain  
│   │   └── stt_tts.py          # Speech-to-text/text-to-speech logic  
│   │  
│   ├── avatar/                 # Avatar management  
│   │   ├── avatar_design/      # 2D avatar assets (images, animations)  
│   │   ├── lip_sync.py         # D-ID integration for lip-syncing  
│   │   └── render_lesson.py    # Generates avatar video from script
│   │   └── tts.py              # Transform text to audio speech  
│   │  
│   ├── ui/                     # User interface  
│   │   ├── frontend/           # React/Streamlit code  
│   │   │   ├── app.py          # Streamlit UI entry point  
│   │   │   └── components/     # React components (if using React)  
│   │   └── assets/             # CSS/images for the UI  
│   │  
│   └── utils/                  # Helper functions  
│       ├── config_loader.py    # Loads environment variables  
│       └── logger.py           # Logging setup  
│  
├── tests/                      # Unit and integration tests  
│   ├── test_data_ingestion.py  
│   └── test_qa_system.py  
│  
├── notebooks/                  # Experimental Jupyter notebooks  
│   └── prototype_testing.ipynb # Early-stage concept validation  
│  
├── scripts/                    # Utility scripts (e.g., backups)  
│   └── backup_data.sh  
│  
├── logs/                       # Log files (errors, API calls)  
│   └── app.log  
│  
├── assets/                     # Media files for the avatar/UI  
│   ├── images/                 # Avatar PNGs/SVGs  
│   ├── audio/                  # Generated voice clips (ElevenLabs)  
│   └── videos/                 # Rendered avatar lessons (D-ID)  
│  
└── config/                     # Configuration files  
    ├── settings.yaml           # Hyperparameters (e.g., GPT-4 temperature)  
    └── api_endpoints.json      # URLs for D-ID, ElevenLabs, etc.  