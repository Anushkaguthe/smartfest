#  Smart Fest Pass Management System

A full-stack web application to automate college fest registrations, event management, and QR-based pass verification.

## Problem

Traditional college fest management involves manual registrations, long queues, and inefficient verification.

## Solution

This system provides:

- Online event registration.
- QR-based digital pass generation.
- Admin dashboard for managing events and - participants.


## Tech Stack

- Frontend: HTML, CSS, Bootstrap
- Backend: Node.js, Express.js
- Database: MySQL


## Features

 - User Authentication (Login/Register)
 - QR-based Pass Generation
 - Event Registration
 - Admin Dashboard
 - Food token system


## Screenshots

- Register Page
 ./screenshots/registerPage.png
- Login Page
    ./screenshots/loginPage.png
- Participant Dashboard
    ./screenshots/participantDashboard.png
- QR Generation
    ./screenshots/QRgeneration.png
- Judge Dashboard
    ./screenshots/judgeDashboard.png
- Food Token Generation
    ./screenshots/FoodToken.png


## Database Design

- Participant table
- Event table
- Many-to-Many relationship handling
- QR token & scan logs system



## How to Run

1. Clone the repo
   git clone https://github.com/Anushkaguthe/smartfest.git

2. Install dependencies
   npm install

3. Setup MySQL database

4. Run server
   node app.js

5. Open in browser
   http://localhost:3000

##  Future Enhancements

- Payment integration
- Email/SMS notifications
- Cloud deployment

