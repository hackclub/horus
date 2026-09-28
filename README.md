<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/3854f28a-abae-4b1b-8c5b-8d23b1f1fa3a" />


# Horus Dashboard
Horus centralizes your [Hack Club](https://hackclub.com) support channels and gives you a **unified view** of your support operations, all with **blazing** speeds.

## Features
- See tickets you mightve forgotten about
- Filter tickets by who its assigned to, or by status
- Open any ticket randombly
- See a live leaderboard of the staff teams and their ticket counts
- Get statistics on how long a ticket usually is open
- See a breakdown on tickets by their status
- Search the queue and peek at any ticket without leaving Horus
- Read the full ticket message with your own Nephthys API key (per instance, stored encrypted)
- AI with your own [Hack Club AI](https://ai.hackclub.com) key: ticket summaries, reply drafts, and a queue brief that groups tickets and says what to pick next

## Hidden or upcoming features
- [x] User and instance management for super admins
  - [x] Manage instances in the DB rather than in a config file
  - [x] Assign users organization roles and give them role based access to their instances
  - [x] Impersonation of users for super admins
  - [ ] Hide instances to the public
- [ ] Integrate with Jelly
  - [ ] Integrate statistics with nephthys
  - [ ] Filter conversations like with tickets by better
  - [ ] Teamwork flawlessly
  - [x] Add marm
- [ ] nephthys but better?

## Contributing
- Clone the repo: `git clone https://github.com/lazylllama/horus-dashboard.git`
- Copy the environment variables file and fill them in: `cp .example.env .env`
- Install dependencies: `bun i`
- Run the development server: `bun dev`
- [http://localhost:3000](http://localhost:3000)

*Please follow conventional commits thank you, any questions please DM me on slack (@Simon K) or send me an email me@lazyllama.xyz!*
