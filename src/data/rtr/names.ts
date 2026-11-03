// Name pools for generated wrestlers (the indie scene, rookies) and people (bookers, promoters).
// Real names from each country; pools avoid famous wrestlers' surnames, and BLOCKED catches the rest.
import type { Gender, WrestlerClass } from './types';

type Rnd = () => number;

export interface NamePool {
  m: string[];
  f: string[];
  last: string[];
  /** Family name first (China, South Korea). */
  familyFirst?: boolean;
}

export const NAMES: Record<string, NamePool> = {
  USA: {
    m: ['Tyler', 'Marcus', 'Dalton', 'Jared', 'Corey', 'Darius', 'Wade', 'Travis', 'Colton', 'Malik', 'Shane', 'Derek', 'Brandon', 'Reggie', 'Hunter', 'Caleb', 'Dustin', 'Trent', 'Jamal', 'Lance', 'Garrett', 'Cody', 'Mason', 'Austin'],
    f: ['Kayla', 'Brianna', 'Destiny', 'Shelby', 'Tasha', 'Jordan', 'Kelsey', 'Monique', 'Harper', 'Dakota', 'Raven', 'Tiffany', 'Jade', 'Courtney', 'Aaliyah', 'Brooke', 'Paige', 'Savannah', 'Kendra', 'Lacey'],
    last: ['Holloway', 'Pruitt', 'Danforth', 'McCready', 'Booker', 'Langston', 'Whitlock', 'Dobbs', 'Garrison', 'Kessler', 'Beaumont', 'Rourke', 'Tillman', 'Hargrove', 'Pryor', 'Sutton', 'Mabry', 'Stroud', 'Calloway', 'Fenwick', 'Rutledge', 'Banner', 'Coley', 'Driscoll', 'Haskins', 'Lockett', 'Varner', 'Whitaker', 'Yancey', 'Jessup'],
  },
  Canada: {
    m: ['Liam', 'Mathieu', 'Brody', 'Connor', 'Étienne', 'Gord', 'Keegan', 'Marc-André', 'Owen', 'Rhys', 'Simon', 'Tanner', 'Wyatt', 'Yannick', 'Dawson', 'Logan', 'Félix', 'Quinn', 'Riley', 'Nolan'],
    f: ['Chantal', 'Kaitlyn', 'Geneviève', 'Brynn', 'Mackenzie', 'Josée', 'Taryn', 'Sloane', 'Maëlle', 'Kenzie', 'Shannon', 'Élodie', 'Tamsin', 'Avery', 'Rosalie', 'Darcy', 'Noémie', 'Hollis', 'Kirsten', 'Marie-Ève'],
    last: ['Tremblay', 'Gagnon', 'Fraser', 'MacKinnon', 'Pelletier', 'Bouchard', 'Lachance', 'Ross', 'Thibault', 'Cormier', 'Lafleur', 'MacIsaac', 'Ouellette', 'Gauthier', 'Kowalchuk', 'Doucet', 'Robichaud', 'Stewart', 'Paquette', 'Morin', 'Leblanc', 'Sinclair', 'Boucher', 'Nadeau', 'Fortier', 'Haldane', 'McKay', 'Duchesne', 'Arsenault', 'Belanger'],
  },
  Mexico: {
    m: ['Rodrigo', 'Joaquín', 'Ulises', 'Emiliano', 'Iván', 'Santiago', 'Gerardo', 'Alonso', 'Hugo', 'Leonel', 'Mauricio', 'Octavio', 'Rubén', 'Saúl', 'Tadeo', 'Valentín', 'Ernesto', 'Ramiro', 'Fausto', 'Benito'],
    f: ['Ximena', 'Guadalupe', 'Renata', 'Itzel', 'Mariana', 'Fernanda', 'Citlali', 'Daniela', 'Lucía', 'Yesenia', 'Abigail', 'Regina', 'Paola', 'Araceli', 'Nayeli', 'Marisol', 'Brenda', 'Rocío', 'Jimena', 'Valeria'],
    last: ['Hernández', 'Ortega', 'Villanueva', 'Cárdenas', 'Salazar', 'Zamora', 'Arellano', 'Bautista', 'Cervantes', 'Domínguez', 'Escobedo', 'Fuentes', 'Galván', 'Ibarra', 'Jiménez', 'Ledesma', 'Medina', 'Nava', 'Ochoa', 'Peralta', 'Quintero', 'Robles', 'Saucedo', 'Tovar', 'Urías', 'Valdivia', 'Yáñez', 'Zúñiga', 'Barragán', 'Coronado'],
  },
  Argentina: {
    m: ['Facundo', 'Lautaro', 'Nahuel', 'Tomás', 'Agustín', 'Bautista', 'Ezequiel', 'Franco', 'Gonzalo', 'Ignacio', 'Joaquín', 'Leandro', 'Maximiliano', 'Nicanor', 'Ramiro', 'Santino', 'Thiago', 'Valentín', 'Bruno', 'Ciro'],
    f: ['Agustina', 'Belén', 'Candela', 'Delfina', 'Florencia', 'Jazmín', 'Lucila', 'Malena', 'Milagros', 'Micaela', 'Pilar', 'Rocío', 'Sol', 'Victoria', 'Ailén', 'Brisa', 'Josefina', 'Luján', 'Martina', 'Antonella'],
    last: ['Benítez', 'Correa', 'Echeverría', 'Ferreyra', 'Gutiérrez', 'Ledesma', 'Moyano', 'Ojeda', 'Palacios', 'Quiroga', 'Rivarola', 'Sosa', 'Toledo', 'Villalba', 'Zárate', 'Acosta', 'Bustos', 'Cabral', 'Godoy', 'Lucero', 'Maidana', 'Navarro', 'Olmedo', 'Paz', 'Roldán', 'Sandoval', 'Vera', 'Arrieta', 'Bianchi', 'Coria'],
  },
  Brazil: {
    m: ['Thiago', 'Leandro', 'Rafael', 'Gustavo', 'Diego', 'Vinícius', 'Matheus', 'Felipe', 'Rodrigo', 'Júlio', 'Anderson', 'Wellington', 'Renan', 'Igor', 'Otávio', 'Murilo', 'Cauã', 'Danilo', 'Everton', 'Henrique'],
    f: ['Larissa', 'Bianca', 'Fernanda', 'Tainá', 'Juliana', 'Letícia', 'Camila', 'Raquel', 'Débora', 'Priscila', 'Yasmin', 'Natália', 'Lívia', 'Jéssica', 'Thaís', 'Bruna', 'Aline', 'Vitória', 'Manuela', 'Isadora'],
    last: ['Albuquerque', 'Barbosa', 'Cavalcanti', 'Damasceno', 'Esteves', 'Figueiredo', 'Guimarães', 'Lacerda', 'Machado', 'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Ribeiro', 'Sampaio', 'Teixeira', 'Valadares', 'Xavier', 'Bezerra', 'Camargo', 'Diniz', 'Fontes', 'Gouveia', 'Leite', 'Moura', 'Pimentel', 'Rezende', 'Siqueira', 'Torres', 'Vasconcelos'],
  },
  Chile: {
    m: ['Benjamín', 'Vicente', 'Matías', 'Cristóbal', 'Diego', 'Felipe', 'Gaspar', 'Ignacio', 'Javier', 'Lucas', 'Maximiliano', 'Pablo', 'Renato', 'Sebastián', 'Alonso', 'Bastián', 'Claudio', 'Esteban', 'Hernán', 'Rodrigo'],
    f: ['Antonia', 'Catalina', 'Constanza', 'Francisca', 'Isidora', 'Javiera', 'Josefa', 'Macarena', 'Trinidad', 'Valentina', 'Amanda', 'Bárbara', 'Daniela', 'Fernanda', 'Ignacia', 'Karla', 'Maite', 'Paz', 'Rayén', 'Sofía'],
    last: ['Araya', 'Bravo', 'Cáceres', 'Contreras', 'Espinoza', 'Fuentealba', 'Gallardo', 'Henríquez', 'Jara', 'Lagos', 'Muñoz', 'Navarrete', 'Orellana', 'Pino', 'Riquelme', 'Saavedra', 'Tapia', 'Urrutia', 'Valenzuela', 'Zúñiga', 'Alarcón', 'Carrasco', 'Figueroa', 'Gajardo', 'Leiva', 'Montecinos', 'Parra', 'Retamal', 'Sepúlveda', 'Vidal'],
  },
  UK: {
    m: ['Callum', 'Declan', 'Ewan', 'Gareth', 'Harvey', 'Jake', 'Kieran', 'Lewis', 'Owen', 'Rhys', 'Stuart', 'Tom', 'Wes', 'Alfie', 'Craig', 'Dean', 'Fraser', 'Jamie', 'Nathan', 'Rory', 'Darren', 'Kyle', 'Joe', 'Ash'],
    f: ['Abbie', 'Bethany', 'Chloe', 'Demi', 'Ffion', 'Gemma', 'Holly', 'Isla', 'Jodie', 'Kirsty', 'Leanne', 'Mollie', 'Niamh', 'Poppy', 'Rhiannon', 'Shona', 'Stacey', 'Tegan', 'Vicky', 'Zoe'],
    last: ['Ashworth', 'Barraclough', 'Cartwright', 'Dobson', 'Entwistle', 'Fairbairn', 'Greaves', 'Hargreaves', 'Ingham', 'Jowett', 'Kilbride', 'Lomax', 'McAllister', 'Nuttall', 'Oakes', 'Pennington', 'Quayle', 'Rigby', 'Sowerby', 'Thwaite', 'Underwood', 'Varley', 'Wainwright', 'Yardley', 'Bramwell', 'Calder', 'Duckworth', 'Grimshaw', 'Haworth', 'Llewellyn'],
  },
  Germany: {
    m: ['Lukas', 'Jonas', 'Maximilian', 'Felix', 'Tobias', 'Niklas', 'Florian', 'Sebastian', 'Matthias', 'Kai', 'Dennis', 'Marvin', 'Sven', 'Jannik', 'Moritz', 'Philipp', 'Rüdiger', 'Bastian', 'Torsten', 'Leon'],
    f: ['Lena', 'Hannah', 'Lea', 'Johanna', 'Katharina', 'Anja', 'Svenja', 'Franziska', 'Carolin', 'Maren', 'Nele', 'Ulrike', 'Wiebke', 'Annika', 'Jana', 'Sabine', 'Charlotte', 'Frieda', 'Mareike', 'Stefanie'],
    last: ['Bauer', 'Dietrich', 'Engel', 'Fischer', 'Graf', 'Hartmann', 'Jäger', 'Kessler', 'Lindner', 'Möller', 'Neumann', 'Pfeiffer', 'Reuter', 'Schäfer', 'Seidel', 'Thalberg', 'Vogt', 'Weber', 'Ziegler', 'Brandt', 'Eckhardt', 'Falk', 'Günther', 'Haas', 'Krämer', 'Lorenz', 'Martens', 'Ostermann', 'Ritter', 'Steiner'],
  },
  France: {
    m: ['Antoine', 'Baptiste', 'Clément', 'Damien', 'Florian', 'Guillaume', 'Hugo', 'Julien', 'Kévin', 'Loïc', 'Mathis', 'Nathan', 'Olivier', 'Quentin', 'Rémi', 'Sylvain', 'Théo', 'Valentin', 'Yann', 'Bastien'],
    f: ['Amandine', 'Bérénice', 'Camille', 'Delphine', 'Élise', 'Fanny', 'Gaëlle', 'Héloïse', 'Inès', 'Juliette', 'Léa', 'Manon', 'Noémie', 'Océane', 'Pauline', 'Romane', 'Solène', 'Thaïs', 'Victoire', 'Zoé'],
    last: ['Arnaud', 'Barbier', 'Carpentier', 'Dumont', 'Fabre', 'Garnier', 'Hébert', 'Jacquet', 'Lambert', 'Marchand', 'Navarro', 'Perrin', 'Renaud', 'Schmitt', 'Tessier', 'Vasseur', 'Aubert', 'Boyer', 'Collet', 'Duval', 'Ferrand', 'Giraud', 'Laurent', 'Mercier', 'Picard', 'Rousseau', 'Simonet', 'Texier', 'Vidal', 'Leclerc'],
  },
  Spain: {
    m: ['Álvaro', 'Borja', 'Carlos', 'Daniel', 'Eneko', 'Fermín', 'Gonzalo', 'Hugo', 'Íñigo', 'Jorge', 'Lucas', 'Marcos', 'Nacho', 'Óscar', 'Pau', 'Rubén', 'Sergio', 'Unai', 'Xabier', 'Adrián'],
    f: ['Ainhoa', 'Begoña', 'Carmen', 'Elena', 'Irene', 'Laia', 'Lorena', 'Marta', 'Nerea', 'Noelia', 'Olaia', 'Raquel', 'Rocío', 'Sara', 'Triana', 'Vega', 'Alba', 'Cristina', 'Inma', 'Paula'],
    last: ['Aguilar', 'Bermejo', 'Castaño', 'Delgado', 'Etxeberria', 'Ferrer', 'Garrido', 'Herrero', 'Iglesias', 'Lozano', 'Marín', 'Núñez', 'Ortiz', 'Pastor', 'Quesada', 'Romero', 'Serrano', 'Toledo', 'Vidal', 'Arriaga', 'Benavente', 'Calvo', 'Duarte', 'Gallego', 'Lorente', 'Molina', 'Prieto', 'Sanz', 'Soler', 'Velasco'],
  },
  Italy: {
    m: ['Alessandro', 'Davide', 'Federico', 'Giacomo', 'Lorenzo', 'Matteo', 'Nicolò', 'Pietro', 'Riccardo', 'Simone', 'Tommaso', 'Andrea', 'Emanuele', 'Fabrizio', 'Gianluca', 'Luca', 'Massimo', 'Salvatore', 'Stefano', 'Vittorio'],
    f: ['Alessia', 'Beatrice', 'Chiara', 'Elisa', 'Federica', 'Giulia', 'Ilaria', 'Ludovica', 'Martina', 'Noemi', 'Rebecca', 'Sara', 'Valentina', 'Aurora', 'Bianca', 'Carlotta', 'Gaia', 'Irene', 'Serena', 'Viola'],
    last: ['Bassi', 'Caruso', 'D’Amico', 'Esposito', 'Ferraro', 'Galli', 'Lombardi', 'Mancini', 'Marchetti', 'Orlando', 'Pellegrini', 'Rinaldi', 'Santoro', 'Testa', 'Vitale', 'Barone', 'Colombo', 'De Luca', 'Fontana', 'Gentile', 'Longo', 'Martini', 'Monti', 'Palumbo', 'Ricci', 'Sartori', 'Serra', 'Valentini', 'Villa', 'Zanetti'],
  },
  Other: {
    m: ['Mikkel', 'Lars', 'Sander', 'Pieter', 'Jakub', 'Tomasz', 'Mateusz', 'Ondřej', 'Dusan', 'Nikola', 'Stefan', 'Andrei', 'Bogdan', 'Darragh', 'Cian', 'Oisín', 'Eero', 'Joonas', 'Viktor', 'Arvid'],
    f: ['Freja', 'Ingrid', 'Sanne', 'Fleur', 'Zofia', 'Agnieszka', 'Klára', 'Jelena', 'Milica', 'Ioana', 'Aoife', 'Saoirse', 'Siobhan', 'Aino', 'Linnea', 'Astrid', 'Petra', 'Katja', 'Mila', 'Elin'],
    last: ['Nygaard', 'Halvorsen', 'Lindqvist', 'Van Dijk', 'De Vries', 'Kowalczyk', 'Nowak', 'Wiśniewski', 'Dvořák', 'Novák', 'Petrović', 'Jovanović', 'Popescu', 'Ionescu', 'Ó Briain', 'Gallagher', 'Kennedy', 'Virtanen', 'Mäkinen', 'Bergström', 'Holm', 'Janssen', 'Mertens', 'Horvat', 'Kovač', 'Szabó', 'Varga', 'Andersen', 'Eriksen', 'Lund'],
  },
  Japan: {
    m: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kaito', 'Riku', 'Takumi', 'Shun', 'Kenta', 'Ryota', 'Daiki', 'Kosuke', 'Masato', 'Naoki', 'Shota', 'Tatsuya', 'Yusuke', 'Kazuki', 'Hayato', 'Jin'],
    f: ['Yui', 'Hina', 'Aoi', 'Mio', 'Sakura', 'Rin', 'Natsuki', 'Ayaka', 'Haruka', 'Miyu', 'Kaede', 'Yuna', 'Nanami', 'Saki', 'Momoka', 'Chihiro', 'Rika', 'Emi', 'Tomoe', 'Akane'],
    last: ['Takeda', 'Kuroda', 'Fujiwara', 'Ishikawa', 'Matsuda', 'Okamoto', 'Shimizu', 'Yamaguchi', 'Hasegawa', 'Kobayashi', 'Inoue', 'Saito', 'Morita', 'Nakagawa', 'Aoki', 'Endo', 'Fukuda', 'Hamada', 'Ikeda', 'Kawaguchi', 'Maeda', 'Nomura', 'Ogawa', 'Sakamoto', 'Tamura', 'Ueda', 'Wada', 'Yoshida', 'Kitamura', 'Sugiyama'],
  },
  China: {
    familyFirst: true,
    m: ['Wei', 'Jun', 'Hao', 'Lei', 'Bo', 'Peng', 'Tao', 'Yang', 'Jian', 'Zhen', 'Kai', 'Rui', 'Xiang', 'Ming', 'Feng', 'Gang', 'Hui', 'Qiang', 'Yu', 'Zihan'],
    f: ['Mei', 'Ling', 'Xia', 'Yan', 'Jing', 'Hui', 'Lan', 'Qing', 'Ting', 'Yun', 'Fang', 'Na', 'Xue', 'Min', 'Rong', 'Shan', 'Wen', 'Zhi', 'Lili', 'Ying'],
    last: ['Wang', 'Li', 'Zhang', 'Liu', 'Huang', 'Zhao', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Luo', 'Gao', 'Zheng', 'Liang', 'Xie', 'Song', 'Tang', 'Han', 'Feng', 'Deng', 'Cao', 'Peng', 'Zeng', 'Xiao'],
  },
  'South Korea': {
    familyFirst: true,
    m: ['Min-jun', 'Seo-jun', 'Do-yun', 'Ha-jun', 'Ji-ho', 'Hyun-woo', 'Jun-seo', 'Tae-yang', 'Sung-min', 'Woo-jin', 'Dong-hyun', 'Jae-sung', 'Kyung-ho', 'Sang-woo', 'Young-ho', 'Joon-ho', 'In-su', 'Myung-soo', 'Chan-wook', 'Ki-tae'],
    f: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Min-seo', 'Su-a', 'Ye-jin', 'Ji-min', 'Yu-na', 'Chae-won', 'So-yeon', 'Eun-ji', 'Hye-jin', 'Na-yeon', 'Bo-ra', 'Da-eun', 'Ji-hye', 'Soo-jin', 'Mi-rae', 'Ga-young', 'Hana'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Yoo', 'Hong', 'Jeon', 'Ko', 'Moon', 'Yang', 'Son', 'Bae', 'Baek', 'Heo', 'Nam', 'Noh'],
  },
  India: {
    m: ['Arjun', 'Vikram', 'Rohan', 'Karan', 'Aditya', 'Rahul', 'Siddharth', 'Manish', 'Harpreet', 'Gurdeep', 'Rajesh', 'Varun', 'Nikhil', 'Pranav', 'Dev', 'Kabir', 'Ishaan', 'Amit', 'Suresh', 'Balwinder'],
    f: ['Ananya', 'Kavya', 'Meera', 'Diya', 'Ishita', 'Nandini', 'Pooja', 'Riya', 'Sanya', 'Tanvi', 'Harleen', 'Jaspreet', 'Aditi', 'Neha', 'Shreya', 'Divya', 'Lakshmi', 'Simran', 'Zara', 'Anjali'],
    last: ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Menon', 'Chopra', 'Malhotra', 'Bhatia', 'Sandhu', 'Gill', 'Dhillon', 'Rao', 'Joshi', 'Kulkarni', 'Pillai', 'Banerjee', 'Chatterjee', 'Mehta', 'Desai', 'Kapoor', 'Saxena', 'Thakur', 'Yadav', 'Grewal', 'Bose', 'Naidu', 'Shetty', 'Agarwal'],
  },
  Egypt: {
    m: ['Omar', 'Karim', 'Youssef', 'Mostafa', 'Tarek', 'Hossam', 'Sherif', 'Ahmed', 'Mahmoud', 'Ziad', 'Hany', 'Walid', 'Amr', 'Islam', 'Khaled', 'Ramy', 'Seif', 'Tamer', 'Nader', 'Bassem'],
    f: ['Nour', 'Salma', 'Yasmin', 'Mariam', 'Habiba', 'Farida', 'Dina', 'Rana', 'Laila', 'Hana', 'Aya', 'Mona', 'Reem', 'Shahd', 'Malak', 'Nada', 'Sara', 'Jana', 'Heba', 'Rania'],
    last: ['Abdelrahman', 'Badawi', 'el-Masry', 'Fawzy', 'Gaber', 'Hamdy', 'Ismail', 'Kamal', 'Lotfy', 'Mansour', 'Nasser', 'Osman', 'Ragab', 'Saleh', 'Tawfik', 'Wahba', 'Youssef', 'Zaki', 'Abaza', 'Darwish', 'el-Gamal', 'Farouk', 'Hegazy', 'Khalil', 'Mahrous', 'Naguib', 'Rashad', 'Shaker', 'Sobhy', 'Soliman'],
  },
  Nigeria: {
    m: ['Chinedu', 'Emeka', 'Obinna', 'Tunde', 'Segun', 'Femi', 'Ikenna', 'Uche', 'Kelechi', 'Babatunde', 'Musa', 'Ibrahim', 'Chidi', 'Olumide', 'Dayo', 'Nnamdi', 'Ifeanyi', 'Kunle', 'Tobi', 'Yusuf'],
    f: ['Chiamaka', 'Ngozi', 'Funmilayo', 'Folake', 'Amaka', 'Ifeoma', 'Yetunde', 'Zainab', 'Bisola', 'Kemi', 'Nneka', 'Temitope', 'Aisha', 'Chioma', 'Adaora', 'Ronke', 'Simisola', 'Uchechi', 'Halima', 'Ebele'],
    last: ['Adeyemi', 'Okonkwo', 'Nwosu', 'Balogun', 'Eze', 'Ogunleye', 'Bello', 'Afolabi', 'Chukwu', 'Danjuma', 'Ekwueme', 'Fashola', 'Ibekwe', 'Lawal', 'Nnaji', 'Obi', 'Oladipo', 'Onyeka', 'Salami', 'Uzor', 'Abubakar', 'Adebayo', 'Akande', 'Ezeh', 'Ige', 'Mbah', 'Odum', 'Ogbonna', 'Olatunji', 'Umeh'],
  },
  Ghana: {
    m: ['Kwame', 'Kojo', 'Yaw', 'Kwaku', 'Kofi', 'Kwabena', 'Kwesi', 'Nana', 'Ebo', 'Fiifi', 'Paa', 'Selorm', 'Elikem', 'Kobby', 'Edem', 'Jojo', 'Nii', 'Kpakpo', 'Mawuli', 'Senyo'],
    f: ['Akosua', 'Abena', 'Afua', 'Adwoa', 'Efua', 'Ekua', 'Akua', 'Yaa', 'Esi', 'Ama', 'Adjoa', 'Naa', 'Dzifa', 'Enyonam', 'Mansa', 'Serwaa', 'Nhyira', 'Afia', 'Aseye', 'Elinam'],
    last: ['Boateng', 'Owusu', 'Appiah', 'Agyeman', 'Darko', 'Ofori', 'Addo', 'Ansah', 'Badu', 'Frimpong', 'Gyamfi', 'Kuffour', 'Manu', 'Nkansah', 'Opoku', 'Sarpong', 'Tetteh', 'Wiredu', 'Yeboah', 'Acheampong', 'Amponsah', 'Bonsu', 'Danquah', 'Kyei', 'Lartey', 'Nyarko', 'Osei', 'Quartey', 'Sackey', 'Quaicoe'],
  },
  'South Africa': {
    m: ['Sipho', 'Thabo', 'Lwazi', 'Kagiso', 'Mandla', 'Bongani', 'Tshepo', 'Ruan', 'Pieter', 'Jaco', 'Dylan', 'Lebo', 'Sizwe', 'Musa', 'Neo', 'Tumelo', 'Vusi', 'Wikus', 'Francois', 'Kabelo'],
    f: ['Thandiwe', 'Lerato', 'Naledi', 'Zanele', 'Palesa', 'Busisiwe', 'Anele', 'Karabo', 'Marli', 'Elmarie', 'Nandi', 'Refilwe', 'Sbu', 'Tumi', 'Ayanda', 'Mpho', 'Lindiwe', 'Annelie', 'Zinhle', 'Kea'],
    last: ['Nkosi', 'Khumalo', 'Mokoena', 'Zulu', 'Mthembu', 'Botha', 'Pretorius', 'Steyn', 'Ndlela', 'Sithole', 'Mahlangu', 'Shabalala', 'Coetzee', 'Venter', 'du Plessis', 'Molefe', 'Radebe', 'Tshabalala', 'Ngcobo', 'Mabaso', 'Joubert', 'Fourie', 'Nel', 'Kekana', 'Masilela', 'Hadebe', 'Cele', 'Majola', 'Swart', 'Visser'],
  },
  Samoa: {
    m: ['Tavita', 'Sione', 'Iosefa', 'Malaki', 'Talia', 'Pita', 'Viliamu', 'Ioane', 'Tasi', 'Fa’afetai', 'Lealofi', 'Semisi', 'Taulapapa', 'Mikaele', 'Faleolo', 'Ropati', 'Simi', 'Tuilagi', 'Matiu', 'Afamasaga'],
    f: ['Losa', 'Malia', 'Sina', 'Fetu', 'Leilani', 'Mele', 'Tiare', 'Aolele', 'Lagi', 'Mareta', 'Salote', 'Teuila', 'Vaitiare', 'Ana', 'Eseta', 'Faith', 'Iolana', 'Litia', 'Penina', 'Sefa'],
    last: ['Leaupepe', 'Tuimavave', 'Fonoti', 'Sapolu', 'Taufa', 'Lauina', 'Fiaui', 'Masoe', 'Seiuli', 'Tuilagi', 'Vaifale', 'Aumua', 'Fuimaono', 'Lemalu', 'Mulitalo', 'Pouono', 'Salave’a', 'Tagaloa', 'Ulufale', 'Vaega', 'Afoa', 'Faleafa', 'Iosua', 'Leota', 'Matagi', 'Paepae', 'Seumalo', 'Toleafoa', 'Tuala', 'Vito'],
  },
  Australia: {
    m: ['Brodie', 'Lachlan', 'Jarrod', 'Mitch', 'Hamish', 'Cooper', 'Damo', 'Fletcher', 'Kane', 'Lochie', 'Nathan', 'Rhys', 'Scott', 'Toby', 'Wade', 'Zac', 'Bailey', 'Corey', 'Jaxon', 'Shane'],
    f: ['Matilda', 'Tahlia', 'Brooke', 'Jess', 'Kiara', 'Mia', 'Shae', 'Sienna', 'Tayla', 'Zara', 'Bree', 'Ellie', 'Imogen', 'Jacinta', 'Kirra', 'Laney', 'Maddie', 'Peta', 'Skye', 'Talia'],
    last: ['Kowalski', 'Fitzgerald', 'Hawthorne', 'Lockyer', 'McIntosh', 'Nolan', 'O’Halloran', 'Pearce', 'Quinlan', 'Rafferty', 'Sheedy', 'Tindall', 'Whitfield', 'Barrett', 'Considine', 'Dempsey', 'Flanagan', 'Gilchrist', 'Healey', 'Jardine', 'Kerrigan', 'Maddox', 'Prendergast', 'Ryder', 'Spratt', 'Trethewey', 'Vickery', 'Walsh', 'Yates', 'Brennan'],
  },
  'New Zealand': {
    m: ['Tama', 'Wiremu', 'Nikau', 'Rangi', 'Manaia', 'Hamish', 'Ollie', 'Blake', 'Tane', 'Kauri', 'Ihaia', 'Rawiri', 'Jonah', 'Mikaere', 'Ari', 'Kahu', 'Logan', 'Finn', 'Te Ariki', 'Hone'],
    f: ['Aroha', 'Anahera', 'Kiri', 'Mere', 'Moana', 'Ngaio', 'Pania', 'Ruby', 'Tui', 'Hana', 'Kaia', 'Maia', 'Te Aroha', 'Georgia', 'Isla', 'Libby', 'Manaia', 'Ataahua', 'Waimarie', 'Ella'],
    last: ['Ngata', 'Parata', 'Tipene', 'Walker', 'Rewi', 'Tamatea', 'Horomona', 'Karaka', 'Te Whare', 'McLeod', 'Whaanga', 'Hapeta', 'Kereama', 'Paewai', 'Ruawai', 'Tuhoe', 'Wihongi', 'Campbell', 'Henare', 'Kingi', 'Marino', 'Ngarimu', 'Poutama', 'Rangihuna', 'Tautahi', 'Waaka', 'Bishop', 'Fleming', 'Hohaia', 'Maaka'],
  },
};

/** Ring names for Spanish-speaking scenes (lucha libre): article plus a noun. */
const LUCHA_M = ['Relámpago', 'Halcón', 'Jaguar', 'Centinela', 'Huracán', 'Fantasma', 'Gladiador', 'Cóndor', 'Vendaval', 'Bandolero', 'Alacrán', 'Tornado', 'Toro', 'Vaquero', 'Espectro', 'Templario', 'Rayo', 'Coyote', 'Pirata', 'Corsario'];
const LUCHA_F = ['Sirena', 'Pantera', 'Gata', 'Medusa', 'Tormenta', 'Gaviota', 'Leona', 'Estrella', 'Bruja', 'Reina', 'Llama', 'Avispa', 'Dama', 'Luna', 'Centella', 'Viuda', 'Paloma', 'Cobra', 'Sombra', 'Rosa'];
const LUCHA_ADJ = ['Negro', 'de Plata', 'Dorado', 'Salvaje', 'Infernal', 'de Fuego', 'Azul', 'Rojo', 'del Norte', 'Místico'];
const LUCHA_ADJ_F = ['Negra', 'de Plata', 'Dorada', 'Salvaje', 'Infernal', 'de Fuego', 'Azul', 'Roja', 'del Norte', 'Mística'];
const LUCHA = new Set(['Mexico', 'Argentina', 'Chile', 'Spain']);

/** Nicknames that go in quotes before a real name: "The Hammer" Brenda Banks. */
const NICKS = ['The Spark', 'Brick', 'The Viper', 'Lightning', 'The Anvil', 'Hurricane', 'The Kid', 'Iceman', 'The Blade', 'Smash', 'The Tank', 'Wildcat', 'The Doctor', 'Rocket', 'The Saint', 'Bulldog', 'The Ghost', 'Cyclone', 'The Wolf', 'Hammer'];

/** Real wrestlers' names (and the like) a combination must never land on. */
export const BLOCKED = new Set([
  'John Cena', 'Steve Austin', 'Bret Hart', 'Owen Hart', 'Shawn Michaels', 'Ric Flair', 'Randy Orton', 'Roman Reigns', 'Seth Rollins', 'Kenny Omega',
  'Kazuchika Okada', 'Hiroshi Tanahashi', 'Becky Lynch', 'Charlotte Flair', 'Sasha Banks', 'Bianca Belair', 'Rhea Ripley', 'Jon Moxley', 'Cody Rhodes',
  'Dusty Rhodes', 'Hulk Hogan', 'Randy Savage', 'Rey Mysterio', 'Eddie Guerrero', 'Chris Jericho', 'Kurt Angle', 'Brock Lesnar', 'Will Ospreay',
  'Drew McIntyre', 'Finn Balor', 'Jay White', 'Bryan Danielson', 'Daniel Bryan', 'Sami Zayn', 'Kevin Owens', 'Mick Foley', 'Jake Roberts',
  'Shinsuke Nakamura', 'Tetsuya Naito', 'Kota Ibushi', 'Kofi Kingston', 'Bobby Lashley', 'Mark Henry', 'Jade Cargill', 'Toni Storm', 'Jamie Hayter',
  'Jacob Fatu', 'Solo Sikoa', 'Jey Uso', 'Jimmy Uso', 'Samoa Joe', 'Ilja Dragunov', 'Jordan Devlin', 'Pete Dunne', 'Tyler Bate', 'Zack Sabre',
  'Shayna Baszler', 'Ronda Rousey', 'Nia Jax', 'Bayley', 'Natalya', 'Beth Phoenix', 'Trish Stratus', 'Hikaru Shida', 'Kairi Sane', 'Io Shirai',
  'Mercedes Mone', 'Thunder Rosa', 'Penta', 'Rey Fenix', 'Bandido', 'Mistico', 'Ricochet', 'Will Ospreay', 'Kyle O’Reilly', 'Adam Cole',
]);

const pick = <T>(rnd: Rnd, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

/** The pool for a country (anywhere unlisted gets the mixed European one). */
export const poolFor = (country: string): NamePool => NAMES[country] ?? NAMES.Other!;

/** A plain real name: given and family name, the right way round for the country. */
export function personName(rnd: Rnd, country: string, gender: Gender): string {
  const p = poolFor(country);
  const first = pick(rnd, gender === 'FEMALE' ? p.f : p.m);
  const last = pick(rnd, p.last);
  return p.familyFirst ? `${last} ${first}` : `${first} ${last}`;
}

/**
 * A wrestler's name: usually a real name, sometimes a ring name (lucha scenes) or a quoted nickname.
 * Never one already `taken`, and never a real wrestler's.
 */
export function wrestlerName(rnd: Rnd, country: string, gender: Gender, taken: ReadonlySet<string>, ringShare = 0.25): string {
  const female = gender === 'FEMALE';
  for (let tries = 0; tries < 60; tries++) {
    let name: string;
    const roll = rnd();
    if (roll < ringShare && LUCHA.has(country)) {
      name = female ? `La ${pick(rnd, LUCHA_F)}` : `El ${pick(rnd, LUCHA_M)}`;
      if (rnd() < 0.5) name += ` ${pick(rnd, female ? LUCHA_ADJ_F : LUCHA_ADJ)}`;
    } else if (roll < ringShare * 0.5) {
      name = `"${pick(rnd, NICKS)}" ${personName(rnd, country, gender)}`;
    } else {
      name = personName(rnd, country, gender);
    }
    const plain = name.replace(/"[^"]*"\s*/g, '');
    if (!taken.has(name) && !BLOCKED.has(plain) && !BLOCKED.has(name)) return name;
  }
  // The pools are big; this only happens if a world has thousands of people from one country.
  let n = 2;
  const base = personName(rnd, country, gender);
  while (taken.has(`${base} ${roman(n)}`)) n++;
  return `${base} ${roman(n)}`;
}

const roman = (n: number): string => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);

// ------------------------------------------------------------------ gimmicks

const G_ADJ: Record<WrestlerClass, string[]> = {
  POWERHOUSE: ['Iron', 'Granite', 'Mountain', 'Unmovable', 'Heavy', 'Steel', 'Bulldozer', 'Thunder', 'Ironclad', 'Colossal'],
  TECHNICIAN: ['Precise', 'Calculated', 'Textbook', 'Patient', 'Silent', 'Clockwork', 'Studious', 'Measured', 'Surgical', 'Cerebral'],
  STRIKER: ['Lethal', 'Swift', 'Relentless', 'Bare-Knuckle', 'Hard-Hitting', 'Rapid', 'Brutal', 'Sharp', 'Dangerous', 'Explosive'],
  HIGH_FLYER: ['Soaring', 'Daredevil', 'Weightless', 'Fearless', 'Skyward', 'Acrobatic', 'Gravity-Defying', 'Airborne', 'Flying', 'Highwire'],
  HARDCORE: ['Bloodstained', 'Unhinged', 'Scarred', 'Barbed', 'Deathmatch', 'Splintered', 'Feral', 'Wild', 'Rabid', 'Rusted'],
};
const G_NOUN: Record<WrestlerClass, string[]> = {
  POWERHOUSE: ['Giant', 'Juggernaut', 'Wall', 'Tank', 'Brute', 'Titan', 'Bulldog', 'Ox', 'Hammer', 'Freight Train'],
  TECHNICIAN: ['Craftsman', 'Professor', 'Mechanic', 'Grappler', 'Surgeon', 'Tactician', 'Architect', 'Scholar', 'Ringmaster', 'Puzzle'],
  STRIKER: ['Assassin', 'Kickboxer', 'Brawler', 'Knockout Artist', 'Hitman', 'Fighter', 'Enforcer', 'Buzzsaw', 'Sniper', 'Bruiser'],
  HIGH_FLYER: ['Comet', 'Falcon', 'Rocket', 'Phoenix', 'Shooting Star', 'Acrobat', 'Firework', 'Hawk', 'Spark', 'Kite'],
  HARDCORE: ['Madman', 'Survivor', 'Butcher', 'Lunatic', 'Wrecking Ball', 'Junkyard Dog', 'Maniac', 'Outlaw', 'Scrapper', 'Gravedigger'],
};
const G_FACE = ['People’s', 'Hometown', 'Honest', 'Fan-Favourite', 'Working-Class'];
const G_HEEL = ['Arrogant', 'Cold-Hearted', 'Ruthless', 'Spiteful', 'Self-Made'];

/** A gimmick that fits the wrestler's style: "The Soaring Comet", "The Leeds Brawler". */
export function wrestlerGimmick(rnd: Rnd, classes: WrestlerClass[], heel: boolean, city: string | undefined, taken: ReadonlySet<string>): string {
  for (let tries = 0; tries < 30; tries++) {
    const k = pick(rnd, classes);
    const r = rnd();
    const g = r < 0.2 && city ? `The ${city} ${pick(rnd, G_NOUN[k])}`
      : r < 0.35 ? `The ${pick(rnd, heel ? G_HEEL : G_FACE)} ${pick(rnd, G_NOUN[k])}`
        : `The ${pick(rnd, G_ADJ[k])} ${pick(rnd, G_NOUN[k])}`;
    if (!taken.has(g)) return g;
  }
  return `The ${pick(rnd, G_ADJ[classes[0]!])} ${pick(rnd, G_NOUN[classes[0]!])}`;
}
