-- MESSAGES SERVICE SAMPLE DATA

-- Messages for Group 1: Alice <-> Bob
INSERT INTO Messages (GroupID, SenderID, Content, Timestamp, Status) VALUES
(1, 1, 'Hey Bob! How are you?', '2025-01-10 14:25:00', 'sent'),
(1, 2, 'Hi Alice! I''m good, thanks!', '2025-01-10 14:26:00', 'sent'),
(1, 1, 'Great! Want to grab coffee later?', '2025-01-10 14:30:00', 'sent');

-- Messages for Group 2: Alice <-> Carol
INSERT INTO Messages (GroupID, SenderID, Content, Timestamp, Status) VALUES
(2, 1, 'Carol, did you finish the assignment?', '2025-01-09 16:40:00', 'sent'),
(2, 3, 'Almost done! Just need to review it.', '2025-01-09 16:45:00', 'sent');

-- Messages for Group 3: Bob <-> Dave
INSERT INTO Messages (GroupID, SenderID, Content, Timestamp, Status) VALUES
(3, 2, 'Dave, are you coming to the meeting?', '2025-01-08 10:15:00', 'sent'),
(3, 4, 'Yes, I''ll be there at 3pm', '2025-01-08 10:20:00', 'sent');

-- Messages for Group 4: Frank <-> Grace (Frank not in Grace's contacts)
INSERT INTO Messages (GroupID, SenderID, Content, Timestamp, Status) VALUES
(4, 6, 'Hi Grace, this is Frank from the conference', '2025-01-11 09:10:00', 'sent'),
(4, 7, 'Oh hi! Good to hear from you!', '2025-01-11 09:15:00', 'sent');

-- Messages for Group 5: Study Group
INSERT INTO Messages (GroupID, SenderID, Content, Timestamp, Status) VALUES
(5, 1, 'Hey everyone! Ready for the exam?', '2025-01-10 17:50:00', 'sent'),
(5, 2, 'Still reviewing chapter 5', '2025-01-10 17:52:00', 'sent'),
(5, 3, 'I have some notes I can share', '2025-01-10 17:55:00', 'sent'),
(5, 5, 'That would be great Carol!', '2025-01-10 18:00:00', 'sent');

-- Messages for Group 6: Project Team
INSERT INTO Messages (GroupID, SenderID, Content, Timestamp, Status) VALUES
(6, 2, 'Team, we need to finalize the presentation', '2025-01-09 12:20:00', 'sent'),
(6, 4, 'I''ve finished my slides', '2025-01-09 12:25:00', 'sent'),
(6, 5, 'Mine are ready too!', '2025-01-09 12:30:00', 'sent');

-- Messages for Group 7: Weekend Plans
INSERT INTO Messages (GroupID, SenderID, Content, Timestamp, Status) VALUES
(7, 3, 'Who wants to go hiking this weekend?', '2025-01-07 19:50:00', 'sent'),
(7, 1, 'I''m in!', '2025-01-07 19:55:00', 'sent'),
(7, 4, 'Count me in too!', '2025-01-07 20:00:00', 'sent');
