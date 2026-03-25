-- GROUPS SERVICE DATABASE
-- Responsible for: Group/conversation management, group members

CREATE TABLE Groups (
    GroupID SERIAL PRIMARY KEY,
    GroupName VARCHAR(255),
    GroupPicture VARCHAR(255),
    CreationDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    IsDirectChat BOOLEAN DEFAULT FALSE,
    LastMessageTimestamp TIMESTAMP
);

CREATE TABLE GroupMembers (
    GroupMemberID SERIAL PRIMARY KEY,
    GroupID INT NOT NULL,
    UserID INT NOT NULL,
    JoinDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Role VARCHAR(255),
    FOREIGN KEY (GroupID) REFERENCES Groups(GroupID) ON DELETE CASCADE,
    UNIQUE(GroupID, UserID)
);
