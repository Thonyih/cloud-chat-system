-- MESSAGES SERVICE DATABASE
-- Responsible for: Message storage, message history

CREATE TABLE Messages (
    MessageID SERIAL PRIMARY KEY,
    GroupID INT NOT NULL,
    SenderID INT NOT NULL,
    Content TEXT,
    Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(255)
);

-- Track per-user read status for each message
CREATE TABLE MessageReads (
    MessageID INT NOT NULL REFERENCES Messages(MessageID) ON DELETE CASCADE,
    UserID INT NOT NULL,
    ReadAt TIMESTAMP,
    PRIMARY KEY (MessageID, UserID)
);
