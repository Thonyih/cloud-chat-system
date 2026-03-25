-- CONTACTS SERVICE DATABASE
-- Responsible for: Managing user contacts, blocking

CREATE TABLE Contacts (
    ContactID SERIAL PRIMARY KEY,
    UserID INT NOT NULL,
    ContactUserID INT NOT NULL,
    Blocked BOOLEAN
);
