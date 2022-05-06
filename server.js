require('dotenv').config();

const express = require("express");
const cors = require("cors");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: ["https://votemotion.kr"],
    methods: ["GET", "POST"],
    credentials: true
  })
);

const cookieParser = require("cookie-parser");
const session = require("express-session");
app.use(cookieParser());
app.use(
  session({
    key: "id",
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      expires: 60 * 60 * 24 * 1000,
      httpOnly: true,
      // sameSite: "none", // [주의] 쿠키를 먹어치워버리고 싶다면 주석을 지워라!
      // secure: true
    }
  })
);

const bcrypt = require("bcrypt");

const mysql = require("mysql");
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PW,
  port: process.env.DB_PORT,
  database: process.env.DB_DB,
  typeCast: field => field.string()
});

const random_string = require("./function/random_string");

app.post("/api/data/upload_votecontent", (req, res) => {
  let next;

  db.query(
    "SELECT id FROM vote_object ORDER BY id DESC LIMIT 1",
    (err, data) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      if(data.length == 0) next = 1;
      else next = +data[0].id + 1;
      
      db.query(
        `INSERT INTO vote_object (id, path, created_at, title, uploader, votecontent, votecontent_total_votes, votecontent_each_votes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          next,
          "/" + random_string(),
          new Date(),
          req.body.title,
          req.body.uploader.nickname,
          JSON.stringify([...req.body.votecontent]),
          0,
          JSON.stringify(Array(req.body.votecontent.length).fill(0))
        ],
        (err, data) => {
          if(err) {
            console.log(err);
            return res.sendStatus(500).end();
          }

          return res.end();
        }
      );
    }
  );
});

app.post("/api/data/get_votecontent_object", (req, res) => {
  let voc = req.body.voc;
  let lastId;

  db.query(
    "SELECT id FROM vote_object ORDER BY id DESC LIMIT 1",
    (err, data) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      if(data.length == 0) lastId = 0;
      else lastId = +data[0].id;
      
      db.query(
        "SELECT * FROM vote_object WHERE id<=? ORDER BY id DESC LIMIT 10",
        lastId - voc,
        (err, data) => {
          if(err) {
            console.log(err);
            return res.sendStatus(500).end();
          }
    
          if(data.length == 0) res.json({ status: 0 });
          else {
            res.json(
              {
                data: [
                  ...data.map(value => (
                    {
                      path: value.path,
                      title: value.title,
                      created_at: Date.parse(value.created_at),
                      uploader: value.uploader,
                      votecontent: JSON.parse(value.votecontent),
                      comment: value.comment != "" ? JSON.parse(value.comment).reverse() : [],
                      votecontent_total_votes: value.votecontent_total_votes,
                      votecontent_each_votes: value.votecontent_each_votes != "" ? JSON.parse(value.votecontent_each_votes) : []
                    }
                  ))
                ],
                status: 1
              }
            );
          }
        }
      );
    }
  );
});

app.post("/api/data/delete-votecontent", (req, res) => {
  let path = req.body.path;
  
  db.query(
    "DELETE FROM vote_object WHERE path=?",
    path,
    (err, data) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      return res.end();
    }
  );
});

app.post("/api/data/gorv", (req, res) => { // get-outside-routed-voteobject
  let path = "/" + req.body.path;

  db.query(
    "SELECT * FROM vote_object WHERE path=?",
    path,
    (err, data) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }
      
      if(data.length == 0) res.json({ status: 0 });
      else {
        let value = data[0];

        res.json(
          {
            data: {
              path: value.path,
              title: value.title,
              created_at: Date.parse(value.created_at),
              uploader: value.uploader,
              votecontent: JSON.parse(value.votecontent),
              comment: value.comment != "" ? JSON.parse(value.comment).reverse() : [],
              votecontent_total_votes: value.votecontent_total_votes,
              votecontent_each_votes: value.votecontent_each_votes != "" ? JSON.parse(value.votecontent_each_votes) : []
            },
            status: 1
          }
        );
      }
    }
  );
});

app.post("/api/data/upload_comment", (req, res) => {
  let pathname = req.body.pathname;
  let comments = [];
  let comment;
  let uploader = req.body.uploader;
  
  db.query(
    "SELECT comment FROM vote_object WHERE path=?",
    pathname,
    (err, data) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      if(!data[0].comment == "") comments = JSON.parse(data[0].comment);

      comment = JSON.stringify(
        {
          uploader: uploader,
          created_at: +new Date(),
          comment: req.body.comment
        }
      );

      comments.push(comment);
      comments = JSON.stringify(comments);

      db.query(
        "UPDATE vote_object SET comment=? WHERE path=?",
        [comments, pathname],
        (err, data) => {
          if(err) {
            console.log(err);
            return res.sendStatus(500).end();
          }
          return res.end();
        }
      );
    }
  );
});

app.post("/api/data/get_comment", (req, res) => {
  let pathname = req.body.pathname;
  let comments = [];

  db.query(
    "SELECT comment FROM vote_object WHERE path=?",
    pathname,
    (err, data) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      if(data[0].comment == "") return res.json([]);

      comments = JSON.parse(data[0].comment).map(comment => JSON.parse(comment));
      
      res.json(comments);
    }
  );
});

app.post("/api/data/delete-comment", (req, res) => {
  let path = req.body.path;
  let created_at = req.body.created_at;
  let comments = [];

  db.query(
    "SELECT comment FROM vote_object WHERE path=?",
    path,
    (err, data) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }
      
      JSON.parse(data[0].comment).map(comment => {
        comments.push(JSON.parse(comment));
      });

      comments = comments.filter(comment => comment.created_at != created_at);
      comments = comments.map(comment => JSON.stringify(comment));

      db.query(
        "UPDATE vote_object SET comment=? WHERE path=?",
        [JSON.stringify(comments), path],
        (err, data) => {
          if(err) {
            console.log(err);
            return res.sendStatus(500).end();
          }

          return res.end();
        }
      )
    }
  );
});

app.post("/api/register", (req, res) => {
  const nickname = req.body.nickname;
  const password = req.body.password;

  db.query(
    "SELECT * FROM users WHERE nickname=?",
    nickname,
    (err, result) => {
      if(err) {
        console.log(err);
        return res.json({ message: "회원가입 실패... 다시 해줄래요!😋" });
      }

      if(result.length != 0) return res.json({ message: "이미 그 닉네임이 존재해요!😅" });

      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if(err) {
          console.log(err);
          return res.sendStatus(500).end();
        }
    
        db.query(
          "INSERT INTO users (nickname, password) VALUES (?, ?)",
          [nickname, hashedPassword],
          (err, result) => {
            if(err) {
              console.log(err);
              return res.json({ message: "회원가입 실패... 다시 해줄래요!🥰" });
            } else return res.end();
          }
        );
      });
    }
  );
});

app.post("/api/login", (req, res) => {
  const nickname = req.body.nickname;
  const password = req.body.password;

  db.query(
    "SELECT * FROM users WHERE nickname=?",
    nickname,
    (err, result) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      if(result.length == 1) {
        bcrypt.compare(password, result[0].password, (err, mon) => { // Match Or Not
          if(mon) {
            const user = JSON.parse(JSON.stringify(result[0]));
            req.session.user = user;
            
            return res.send({ user });
          } else return res.send({ message: "엥..? 비밀번호가 이상해요!🤔" });
        });
      } else return res.send({ message: "그 닉네임을 쓰는 사람은 없네요..?😥" });
    }
  );
});

app.get("/api/logged-in", (req, res) => {
  if(req.session.user) {
    db.query(
      "SELECT voted_at FROM users WHERE nickname=?",
      req.session.user.nickname,
      (err, result) => {
        if(err) {
          console.log(err);
          return res.sendStatus(500).end();
        }

        return res.send({ loggedIn: true, user: { nickname: req.session.user.nickname, voted_at: result[0].voted_at } });
      }
    )
  }
  else return res.send({ loggedIn: false });
});

app.get("/api/logout", (req, res) => {
  if(req.session.user) {
    req.session.destroy((err) => {
      if(err) console.log(err);
      return res.end();
    });
  }

  return res.end();
});

app.post("/api/get-turnout-list", (req, res) => {
  const pathname = req.body.pathname;

  db.query(
    "SELECT votecontent_total_votes, votecontent_each_votes FROM vote_object WHERE path=?",
    pathname,
    (err, result) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      const votecontent_total_votes = result[0].votecontent_total_votes;
      const votecontent_each_votes = result[0].votecontent_each_votes;
      
      res.send({ votecontent_total_votes, votecontent_each_votes });
    }
  );
});

app.post("/api/voting", (req, res) => {
  const type = req.body.type;
  const pathname = req.body.pathname;
  const nickname = req.body.nickname;
  let voted_at = [];

  function setUserVotedAtData(idx) {
    let currentVoteData = voted_at.filter(data => data.path == pathname);

    if(currentVoteData.length == 0) voted_at.push({ path: pathname, votedIdx: idx });
    else currentVoteData[0].votedIdx = idx;

    db.query(
      "UPDATE users SET voted_at=? WHERE nickname=?",
      [JSON.stringify(voted_at), nickname],
      (err, result) => {
        if(err) {
          console.log(err);
          return res.sendStatus(500).end();
        }
        
        return res.end();
      }
    );
  }

  function setDBHandler(votecontent_total_votes, votecontent_each_votes) {
    db.query(
      "UPDATE vote_object SET votecontent_total_votes=?, votecontent_each_votes=? WHERE path=?",
      [votecontent_total_votes, JSON.stringify(votecontent_each_votes), pathname],
      (err, result) => {
        if(err) {
          console.log(err);
          return res.sendStatus(500).end();
        }
        
        return res.end();
      }
    );
  }

  db.query(
    "SELECT voted_at FROM users WHERE nickname=?",
    nickname,
    (err, result) => {
      if(err) {
        console.log(err);
        return res.sendStatus(500).end();
      }

      if(result[0].voted_at != "") voted_at = JSON.parse(result[0].voted_at);

      db.query(
        "SELECT votecontent_total_votes, votecontent_each_votes FROM vote_object WHERE path=?",
        pathname,
        (err, result) => {
          if(err) {
            console.log(err);
            return res.sendStatus(500).end();
          }
    
          let votecontent_each_votes = JSON.parse(result[0].votecontent_each_votes);
          let votecontent_total_votes = +result[0].votecontent_total_votes;
    
          switch(type) {
            case "INCREMENT":
              let IVoteAtIdx = req.body.voteAtIdx;
              votecontent_each_votes[IVoteAtIdx]++;
              votecontent_total_votes++;

              setUserVotedAtData(IVoteAtIdx);
              setDBHandler(votecontent_total_votes, votecontent_each_votes);
              break;
    
            case "CHANGEMENT":
              let CVoteAtIdx = req.body.voteAtIdx;

              voted_at.filter(data => data.path == pathname)[0].votedIdx = CVoteAtIdx;

              let CDecreaseAtIdx = req.body.decreaseAtIdx;
              votecontent_each_votes[CVoteAtIdx]++;
              votecontent_each_votes[CDecreaseAtIdx]--;

              setUserVotedAtData(CVoteAtIdx);
              setDBHandler(votecontent_total_votes, votecontent_each_votes);
              break;
    
            case "DECREMENT":
              let DDecreaseAtIdx = req.body.decreaseAtIdx;
              votecontent_each_votes[DDecreaseAtIdx]--;
              votecontent_total_votes--;

              voted_at = voted_at.filter(data => data.path != pathname);

              db.query(
                `UPDATE users SET voted_at="" WHERE nickname=?`,
                nickname,
                (err, result) => {
                  if(err) {
                    console.log(err);
                    return res.sendStatus(500).end();
                  }
                  
                  return res.end();
                }
              );
              
              setDBHandler(votecontent_total_votes, votecontent_each_votes);
              break;
          }
        }
      );
    }
  );
});

app.listen(3000);
