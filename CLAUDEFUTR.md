# Job Application Workflow Future

## Goal

- I want to eventually make this app a hosted web application.
- Different users should be able to login securly from the website online.
- There should be a profile page, a dashboard page (main page), and a details page.

### Profile Page

- Contains the users settings and personal info like thier generated resumes, their master resume, their profile.json, and the history of the check-email logs
- User should be prompted to fill/ give the master resume and info for profile.json when first logining in.
- user should be able to change these fields at anytime on the profile page.
- user can only view the email logs, not change them.

### Dashboard page

- This is the main page of the application.
- This page contains a few sections, those being a add a job section using the link or pasting the description
- The combined statuses of every job on the dashboard, such as saved, applied, ect..
- A section that contains all the jobs the user added. each individual job should be a card that displays the Company, role, location, Date applied, date of the last update, and status.
- The user can click on these job cards to take them to a details page.
- There should be a search bar above the job cards, but below the combined statuses section. This search bar is meant to search through the added jobs. Users should be able to search by company and role. There should also be filters for the search such as filter by date applied, last update, and status

### Details page

- contains information about the job, such as: company, role, salary, location, description, status, date applied, date of last update, tailored resume, and apply button if the user has not applied.
- apply button should use the link the user used to add the job.
- The user should be able to edit all the information on this page.

## Resources

- Look at "C:/Users/jkalc/OneDrive/Documents/UWT Spring 2026/TCSS 460 - Client Server/project/group-project-frontend-public-group-4"
- Look at "C:\Users\jkalc\OneDrive\Documents\UWT Spring 2026\TCSS 460 - Client Server\project\group-project-backend-group-4"

- These are part of a past tv/movie review project where different users login and create an account, they can rate and review movies.

## Output

- I want a step by step guide on how I can make this a hosted web app. write the guide to "docs/hosting-plan.md"
- I want to know and understand why the past project has a frontend project and a backend project and what they each do. write this to "docs/past-project.md"
- I want you to give reccommendations on what I should do differently for this project If you think there are better ways to build this. write this to "docs/build-reccommendations.md"

## problems

- I dont know how I would get an ai setup for the users to tailor their resume or scan their email.
- Security???
- Email access per user. Storing other people’s iCloud app passwords on a server is a serious security responsibility. Ask it to compare options, like Gmail/Outlook sign-in with read-only access, or users forwarding job emails to the app.
- Who pays for the AI. Every user’s tailoring and email checks cost API money on your key. Ask how to set per-user limits.
- Parts that only work on your PC. The planned Playwright apply script, the master resume and profile stored as files, and the Windows Task Scheduler job all need a hosted replacement, like database storage, file storage and a scheduled cloud job.

## Constraints

- for now my monthly budget is $0, so lets try to find some free tiers where possible, but i am whilling to spend some money if necessary. This is just for me and my friends for now, but in the future I want to have anyone be able to use this.
