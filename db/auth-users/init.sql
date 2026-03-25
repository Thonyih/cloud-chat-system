-- AUTH/USERS SERVICE DATABASE
-- Responsible for: Authentication (login, register) + User profiles and management

CREATE TABLE Users (
    UserID SERIAL PRIMARY KEY,
    PhoneNumber VARCHAR(255) NOT NULL UNIQUE,
    Username VARCHAR(255) NOT NULL UNIQUE,
    ProfilePicture VARCHAR(255),
    Password VARCHAR(255) NOT NULL,
    Status TEXT,
    LastSeen TIMESTAMP
);
