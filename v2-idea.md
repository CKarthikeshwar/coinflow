split payment feature
<!-- - app keeps a track of various accounts and contacts, preferably by contact names, should be given acces to contacts
 but to respect user privacy we will always have an option to do itmanually without the contacts
- now when we add a payment in the history of the payments there should be an option to split and then no of peple check the contacts then access the contactsa choose them and the next pop up must kepp somthing like % of cash and or money out of total mony to split which starts with equal splits then after that we will send a message to all the choosen contacts and the amount they have to pay to me  after pressing the send option a message with a specifc readable syntax will be sent those particular phone numbers and on the other side when we recieve a message with that specific syntax we put a notification to the app saying this person requested through this number requested for this split and after this when we recieve this money when we are accepting the money we ask should we put some amount of this money any of the split now both the the payment and the split will have this link that when ever we wanna review this it wil be linked
- consider a typical workflow -->
0- i made a payment
- now i got a notification
- i click on edit
- (consider how we handle splits for credit and debit)
- there is an option in the panle to split (ui choice of where to keep thgis)
- when i click on split i get a list of all my contacts and other saved accounts i saved through this app, i also have the option of adding a new number
- once i am done selecting all the people i want to split htis amount with
- i get a new panel where i decide the amount via direct no of percentage, the default is an equal split - (ui choice of having a toggle btwn rupee sympbola nd % to decide)
- once i click on done it sends a message to all these people in a specific format
- on the other side the app reads this special format and gives you a notification that you have been requested to pay this amount 
- you accept or reject the request as you wish, if you accept it goes into the queue, else it gets discarded silently, if you swipe it off it goes to the unattended notifications category in the app
- now the user makes a payment and he gets a notification for this 
- we also have to account for the case where this wasn't paid using upi
- he clicks on edit, then he clicks on merge 
- then it shows a list of pending splits that we want to clear with this amount
- if there is some amount in balance we can choose to discard it
- so when the guy who paid the original amount checks it later, he sees that some amount was paid by this person some by that and remaining that we paid on our own, 
- when we go to transaction page, we see under every transaction if it was paid as split by someone and if it was split to someone and pair or not
