-- CONTACTS SERVICE SAMPLE DATA

-- Alice's contacts
INSERT INTO Contacts (UserID, ContactUserID, Blocked) VALUES
(1, 2, FALSE),
(1, 3, FALSE),
(1, 4, FALSE);

-- Bob's contacts
INSERT INTO Contacts (UserID, ContactUserID, Blocked) VALUES
(2, 1, FALSE),
(2, 4, FALSE),
(2, 5, FALSE);

-- Carol's contacts
INSERT INTO Contacts (UserID, ContactUserID, Blocked) VALUES
(3, 1, FALSE),
(3, 5, FALSE);

-- Dave's contacts
INSERT INTO Contacts (UserID, ContactUserID, Blocked) VALUES
(4, 1, FALSE),
(4, 2, FALSE);

-- Frank's contacts (none - will appear as UNKNOWN when messaging)

-- Grace's contacts
INSERT INTO Contacts (UserID, ContactUserID, Blocked) VALUES
(7, 6, FALSE);
