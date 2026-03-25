-- AUTH SERVICE SAMPLE DATA
-- Users for authentication

INSERT INTO Users (UserID, PhoneNumber, Username, Password, ProfilePicture, Status) VALUES
(1, '+351912345671', 'alice', '$2b$10$ds31puGv0IUFWol/ThEQM.y9QzmD0BQ6JiqLkvcuEluMVAZ40GVSG', 'https://i.pravatar.cc/150?img=1', 'Hey there! I am using AGISIT Chat'),
(2, '+351912345672', 'bob', '$2b$10$ds31puGv0IUFWol/ThEQM.y9QzmD0BQ6JiqLkvcuEluMVAZ40GVSG', 'https://i.pravatar.cc/150?img=2', 'Available'),
(3, '+351912345673', 'carol', '$2b$10$ds31puGv0IUFWol/ThEQM.y9QzmD0BQ6JiqLkvcuEluMVAZ40GVSG', 'https://i.pravatar.cc/150?img=3', 'Busy'),
(4, '+351912345674', 'dave', '$2b$10$ds31puGv0IUFWol/ThEQM.y9QzmD0BQ6JiqLkvcuEluMVAZ40GVSG', 'https://i.pravatar.cc/150?img=4', 'At work'),
(5, '+351912345675', 'eve', '$2b$10$ds31puGv0IUFWol/ThEQM.y9QzmD0BQ6JiqLkvcuEluMVAZ40GVSG', 'https://i.pravatar.cc/150?img=5', 'Studying'),
(6, '+351912345676', 'frank', '$2b$10$ds31puGv0IUFWol/ThEQM.y9QzmD0BQ6JiqLkvcuEluMVAZ40GVSG', 'https://i.pravatar.cc/150?img=6', 'On vacation'),
(7, '+351912345677', 'grace', '$2b$10$ds31puGv0IUFWol/ThEQM.y9QzmD0BQ6JiqLkvcuEluMVAZ40GVSG', 'https://i.pravatar.cc/150?img=7', 'Available');

-- Reset the sequence to continue from the last inserted ID
SELECT setval('users_userid_seq', (SELECT MAX(UserID) FROM Users));

-- Note: Password is hashed version of "password123"
