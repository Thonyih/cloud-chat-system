-- GROUPS SERVICE SAMPLE DATA

-- Direct chats (1-on-1 conversations)
INSERT INTO Groups (GroupID, GroupName, IsDirectChat, LastMessageTimestamp) VALUES
(1, NULL, TRUE, '2025-01-10 14:30:00'),  -- Alice <-> Bob
(2, NULL, TRUE, '2025-01-09 16:45:00'),  -- Alice <-> Carol
(3, NULL, TRUE, '2025-01-08 10:20:00'),  -- Bob <-> Dave
(4, NULL, TRUE, '2025-01-11 09:15:00');  -- Frank <-> Grace

-- Group chats (multi-person)
INSERT INTO Groups (GroupID, GroupName, GroupPicture, IsDirectChat, LastMessageTimestamp) VALUES
(5, 'Study Group', NULL, FALSE, '2025-01-10 18:00:00'),
(6, 'Project Team', NULL, FALSE, '2025-01-09 12:30:00'),
(7, 'Weekend Plans', NULL, FALSE, '2025-01-07 20:00:00');

-- Set sequence to continue from 8
SELECT setval('groups_groupid_seq', 7, true);

-- Group Members for Direct Chats
-- Group 1: Alice <-> Bob
INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES
(1, 1, 'member'),
(1, 2, 'member');

-- Group 2: Alice <-> Carol
INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES
(2, 1, 'member'),
(2, 3, 'member');

-- Group 3: Bob <-> Dave
INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES
(3, 2, 'member'),
(3, 4, 'member');

-- Group 4: Frank <-> Grace
INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES
(4, 6, 'member'),
(4, 7, 'member');

-- Group Members for Group Chats
-- Group 5: Study Group (Alice, Bob, Carol, Eve)
INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES
(5, 1, 'admin'),
(5, 2, 'member'),
(5, 3, 'member'),
(5, 5, 'member');

-- Group 6: Project Team (Bob, Dave, Eve)
INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES
(6, 2, 'admin'),
(6, 4, 'member'),
(6, 5, 'member');

-- Group 7: Weekend Plans (Carol, Alice, Dave)
INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES
(7, 3, 'admin'),
(7, 1, 'member'),
(7, 4, 'member');
