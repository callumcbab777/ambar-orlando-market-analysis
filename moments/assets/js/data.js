const IMG=n=>`assets/img/${n}.jpg`;
const PARKS=["Magic Kingdom","EPCOT","Hollywood Studios","Animal Kingdom","Universal Studios","Islands of Adventure","Epic Universe","SeaWorld"];
const BEYOND=[{v:"golf",l:"Golf",i:"⛳"},{v:"spa",l:"Spa",i:"🌿"},{v:"dining",l:"Dining",i:"🍽"},{v:"shopping",l:"Shopping",i:"🛍"},{v:"lakes",l:"Lakes and nature",i:"🌅"},{v:"coast",l:"Beach and Space Coast day trips",i:"🚀"},{v:"shows",l:"Shows",i:"🎭"}];
const M=[
{id:"why-orlando",name:"Why Orlando",time:"about 2 minutes",invite:"Tell us what’s drawing you to Orlando right now.",desc:"The pull of the place, in your own words.",
 focus:"What’s drawing you here right now — the reasons Orlando is on your mind today.",reward:"A short “Your Orlando, so far” card, written warmly in ABI’s voice from what you share. Edit it, and share it with a partner.",
 screens:[
 {p:"Tell us what’s pulling you toward Orlando.",h:"Pick up to two.",f:[{id:"pull",t:"cards",max:2,opts:[{v:"people",l:"Time with people I love",i:"💛"},{v:"winter",l:"Escaping winter",i:"☀️"},{v:"money",l:"A smart place for my money",i:"🧭"},{v:"retire",l:"Settling in for retirement",i:"🌴"},{v:"parks",l:"Close to the parks",i:"🎢"},{v:"explore",l:"Just exploring",i:"🗺"}]}]},
 {p:"Picture your first morning in a place of your own.",h:"Show us the one that feels most like you.",f:[{id:"morning",t:"images",max:1,opts:[{v:"balcony",l:"Coffee on the balcony",img:"x-balcony"},{v:"pool",l:"An early swim",img:"x-pool"},{v:"tee",l:"A tee time",img:"x-golf"},{v:"rope",l:"Rope-drop at the parks",img:"x-ropedrop"},{v:"spa",l:"A slow wellness morning",img:"x-spa"},{v:"laptop",l:"Laptop on the terrace",img:"x-laptop"}]}]},
 {p:"On a typical stay, how many of you are there?",h:"Your usual party size, little ones included.",f:[{id:"party",t:"stepper",label:"Party size",min:1,max:16,def:2}]}
 ]},
{id:"orlando-days",name:"Orlando Days",time:"about 3 minutes",invite:"Tell us about your Orlando days.",desc:"Parks, dining and the things you love doing.",
 focus:"Parks, dining and the things you love doing — and the pace you like to do them at.",reward:"A starter set of pins and a one-click day plan built around your parks, your dining and your pace.",
 screens:[
 {p:"Tap your parks.",h:"Tap once for been, again for want to go, again for not for me.",f:[{id:"parks",t:"chips3",items:PARKS}]},
 {p:"Which feels more like your perfect park day?",f:[{id:"pace",t:"slider",l:"Every ride till close",r:"A few highlights, then the pool"}]},
 {p:"Show us what you love beyond the parks.",h:"Choose as many as you like.",f:[{id:"beyond",t:"cards",opts:BEYOND}]},
 {p:"Tell us what a good dinner looks like.",f:[{id:"dinner",t:"slider",l:"Casual and lively",r:"Intimate and refined"},{id:"cuisine",t:"chips",label:"Cuisines you love",opts:["Steakhouse","Seafood","Italian","Japanese","Latin","Southern BBQ","Plant-based","Something new"]}]}
 ]},
{id:"hotel-feeling",name:"The Hotel Feeling",time:"about 3 minutes",invite:"Tell us what great service feels like to you.",desc:"Service, Bonvoy and the brand experiences you value.",
 focus:"What great service means to you, plus your Marriott Bonvoy and brand experiences.",reward:"A short guide to branded residences, shaped around what you said matters, so you only see what’s relevant to you.",
 screens:[
 {p:"What makes a stay feel special?",h:"Pick three.",f:[{id:"special",t:"cards",max:3,opts:[{v:"checkin",l:"Seamless check-in",i:"🗝"},{v:"name",l:"Someone knows my name",i:"👋"},{v:"spa",l:"The spa",i:"🌿"},{v:"quiet",l:"Quiet",i:"🤫"},{v:"breakfast",l:"A great breakfast",i:"🥐"},{v:"kids",l:"A kids’ club",i:"🧸"},{v:"design",l:"Beautiful design",i:"✨"},{v:"gym",l:"A proper gym",i:"🏋"}]}]},
 {p:"Which hotels would you happily stay at?",f:[{id:"brands",t:"chips",opts:["Ritz-Carlton","JW Marriott","St. Regis","W","Westin","Four Seasons","Hilton","Hyatt","Other"]},{id:"brandnote",t:"text",label:"Anything they do that you love? (optional)",ph:"The welcome at…"}]},
 {p:"Are you a Marriott Bonvoy member?",f:[{id:"bonvoy",t:"seg",opts:["Yes","No","Not sure"]},{id:"tier",t:"chips",one:true,label:"Your tier",opts:["Member","Silver","Gold","Platinum","Titanium","Ambassador"],showIf:a=>a.bonvoy==="Yes"},{id:"nights",t:"stepper",label:"Nights per year, roughly",min:0,max:200,step:5,def:20,showIf:a=>a.bonvoy==="Yes"}]},
 {p:"How familiar are branded residences to you?",h:"There’s no wrong place to be on this.",f:[{id:"familiar",t:"slider",l:"New to me",r:"Know them well",words:["New to me","Heard of them","Some idea","Fairly familiar","Know them well"]}]},
 {p:"When it comes to looking after the place, which feels more like you?",f:[{id:"care",t:"slider",l:"Handle everything for me",r:"I like being hands-on"}]}
 ]},
{id:"picture-it",name:"Picture It",time:"about 3 minutes",invite:"How do you picture your time there?",desc:"The view, the space, the style and how you’d spend your time.",
 focus:"The view, the space and the style you’re drawn to, and how you imagine spending your time there.",reward:"A shortlist of AMBAR homes and views that match your picks.",note:"Your shortlist adds suggestions — it never hides or excludes anything. Every home stays open to explore.",
 screens:[
 {p:"Which view would you like with your morning coffee?",h:"Sample views, real AMBAR options to come.",f:[{id:"view",t:"images",max:1,opts:[{v:"lake",l:"Calm lake water",img:"x-v-lake"},{v:"pool",l:"Resort pool",img:"x-v-pool"},{v:"skyline",l:"City lights at dusk",img:"x-v-skyline"},{v:"palms",l:"Palms and greenery",img:"x-v-palms"},{v:"green",l:"Fairway green",img:"x-golf"}]}]},
 {p:"Tell us about the space you picture.",f:[{id:"space",t:"slider",l:"Compact and effortless",r:"Room to spread out"},{id:"sleeps",t:"stepper",label:"Sleeps how many",min:1,max:12,def:4}]},
 {p:"Which feels more like you?",h:"Three quick pairs. Go with your gut.",f:[{id:"pairs",t:"pairs",pairs:[[{v:"bright",l:"Bright and open",img:"x-bright"},{v:"eclectic",l:"Collected and characterful",img:"x-loft"}],[{v:"airy",l:"Soft and airy",img:"x-bcalm"},{v:"moody",l:"Calm and cocooning",img:"x-bbold"}],[{v:"crisp",l:"Crisp and classic",img:"x-kmodern"},{v:"rustic",l:"Warm and rustic",img:"x-krustic"}]]}]},
 {p:"Closer to the pool, or higher up?",f:[{id:"height",t:"slider",l:"Closer to the pool",r:"Higher up"}]},
 {p:"How do you picture your time there?",h:"Slide each one to show us. Rough is perfect.",f:[{id:"t_us",t:"slider",label:"Just us",l:"Rarely",r:"Often",freq:true},{id:"t_ff",t:"slider",label:"Family and friends",l:"Rarely",r:"Often",freq:true},{id:"t_guests",t:"slider",label:"Guests staying while we’re away",l:"Rarely",r:"Often",freq:true}]}
 ]},
{id:"on-your-mind",name:"On Your Mind",time:"about 3 minutes",invite:"Tell us what’s on your mind today.",desc:"Your questions and hesitations, and the one thing you’d ask us.",
 focus:"The questions and hesitations you have right now, and the one thing you’d most like to ask us.",reward:"Direct answers from our approved knowledge set to the things you flagged, plus a personal reply from your advisor to your one question.",
 screens:[
 {p:"How do you feel about…",h:"Slide toward “want to know more” and we’ll send you a short explainer.",f:[
  {id:"overseas",t:"slider",label:"Buying from overseas",l:"Easy",r:"Want to know more",explain:true},
  {id:"costs",t:"slider",label:"Annual costs and HOA",l:"Easy",r:"Want to know more",explain:true},
  {id:"afar",t:"slider",label:"Managing from afar",l:"Easy",r:"Want to know more",explain:true},
  {id:"hurricane",t:"slider",label:"Insurance and hurricane season",l:"Easy",r:"Want to know more",explain:true},
  {id:"currency",t:"slider",label:"Currency",l:"Easy",r:"Want to know more",explain:true}]},
 {p:"Is there anything that would give you pause?",h:"Choose any that apply.",f:[{id:"pause",t:"chips",opts:["Being far away","Understanding the paperwork","Running costs","Hurricane season","The timing isn’t right yet","Getting everyone on board","Other"]},{id:"pauseother",t:"text",label:"Tell us more (optional)",ph:"Something else on your mind…",showIf:a=>(a.pause||[]).includes("Other")}]},
 {p:"If you could ask us one thing, what would it be?",h:"Type it the way you’d say it.",f:[{id:"ask",t:"text",mic:true,label:"Your one thing",ph:"I’d love to know…"}]}
 ]},
{id:"your-visit",name:"Your Visit",time:"about 2 minutes",invite:"Tell us how you’d like your tour day to feel.",desc:"Planning your tour, once it’s booked.",note:"Opens once a tour is booked.",
 focus:"Tour planning, for when your visit is booked — who’s coming, what you’d like to see and how you like to travel.",reward:"A personalised tour-day itinerary.",
 screens:[
 {p:"Picture your dream first week. Which season is it?",f:[{id:"season",t:"cards",max:1,season:true,opts:[{v:"Winter",l:"Winter sun",i:"❄️"},{v:"Spring",l:"Spring",i:"🌸"},{v:"Summer",l:"Summer",i:"☀️"},{v:"Autumn",l:"Autumn",i:"🍂"},{v:"Holidays",l:"The holidays",i:"🎄"}]}]},
 {p:"Who’s coming on the tour, and what should we plan around?",f:[{id:"guests",t:"stepper",label:"Guests on the tour",min:1,max:12,def:2},{id:"stepfree",t:"toggle",label:"Step-free routes, please"},{id:"littles",t:"toggle",label:"Little ones in tow (we’ll plan around nap times)"},{id:"plannote",t:"text",label:"Anything else — accessibility, dietary, nap times",ph:"One of us is vegetarian…"}]},
 {p:"Pick three places to fit in.",h:"Drawn from your Orlando Days picks where you’ve shared them.",f:[{id:"places",t:"chips",max:3,dyn:true}]},
 {p:"How should we run your day?",f:[{id:"style",t:"slider",l:"Walk me through everything",r:"Show me around and let me wander"}]}
 ]},
{id:"whos-part",name:"Who’s Part of This",time:"about 1 minute",invite:"Tell us who you’re deciding with.",desc:"The people in the conversation, and how you like to decide.",
 focus:"Who you’re deciding with, and whether you go with gut feel or with a spreadsheet.",reward:"Your advisor tailors how they share information, so it suits you and everyone deciding with you.",
 screens:[
 {p:"Tell us who else is part of this.",f:[{id:"who",t:"chips",opts:["Just me","Partner","Family","Business partner","Accountant or advisor","Committee"]},{id:"invite",t:"invite"}]},
 {p:"What’s changing for you in the next few years?",h:"Entirely optional.",f:[{id:"change",t:"chips",opts:["Retirement","School finishing","Selling a business","Relocating","Nothing much"]}]},
 {p:"How do you like to decide?",f:[{id:"decide",t:"slider",l:"Gut feel",r:"Spreadsheet"}]}
 ]}
];
