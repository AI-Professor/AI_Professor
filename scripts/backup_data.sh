#!/bin/bash

# Backup script for AI Professor project data. Run command in the terminal will create backup log and files for our project: ./scripts/backup_data.sh
BACKUP_DIR="backups/$(date +'%Y-%m-%d_%H-%M-%S')"
LOG_FILE="logs/app.log"

echo "Starting backup at $(date)" >> $LOG_FILE

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup critical data
echo "Backing up knowledge graphs..."
cp -r data/processed/knowledge_graph/ $BACKUP_DIR/

echo "Backing up lesson scripts..."
cp -r data/processed/lesson_script/ $BACKUP_DIR/

echo "Backing up quiz data..."
cp -r data/processed/quiz_data/ $BACKUP_DIR/

echo "Backing up audio..."
cp -r data/processed/audio/ $BACKUP_DIR/

echo "Backing up backend code..."
tar -czf $BACKUP_DIR/backend_backup.tar.gz src/

echo "Backing up frontend code..."
tar -czf $BACKUP_DIR/frontend_backup.tar.gz public/

# Create compressed archive
tar -czf $BACKUP_DIR/full_backup.tar.gz $BACKUP_DIR/*

echo "Backup completed at $(date)" >> $LOG_FILE
echo "Backup saved to: $BACKUP_DIR"