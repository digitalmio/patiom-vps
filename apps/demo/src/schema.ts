export const typeDefs = /* GraphQL */ `
	type Query {
		allFilms: [Film]
		allPeople: [Person]
		allPlanets: [Planet]
		allSpecies: [Species]
		allStarships: [Starship]
		allVehicles: [Vehicle]
		film(id: ID!): Film
		person(id: ID!): Person
		planet(id: ID!): Planet
		species(id: ID!): Species
		starship(id: ID!): Starship
		vehicle(id: ID!): Vehicle
	}

	type Film {
		id: ID!
		title: String
		episodeId: Int
		openingCrawl: String
		director: String
		producer: String
		releaseDate: String
		species: [Species]
		starships: [Starship]
		vehicles: [Vehicle]
		characters: [Person]
		planets: [Planet]
	}

	type Person {
		id: ID!
		name: String
		birthYear: String
		eyeColor: String
		gender: String
		hairColor: String
		height: Int
		mass: Float
		skinColor: String
		homeworld: Planet
		films: [Film]
		species: [Species]
		starships: [Starship]
		vehicles: [Vehicle]
	}

	type Planet {
		id: ID!
		name: String
		diameter: Int
		rotationPeriod: Int
		orbitalPeriod: Int
		gravity: String
		population: Float
		climate: String
		terrain: String
		surfaceWater: Float
		residents: [Person]
		films: [Film]
	}

	type Species {
		id: ID!
		name: String
		classification: String
		designation: String
		averageHeight: Int
		averageLifespan: Int
		eyeColors: String
		hairColors: String
		skinColors: String
		language: String
		homeworld: Planet
		people: [Person]
		films: [Film]
	}

	type Starship {
		id: ID!
		name: String
		model: String
		manufacturer: String
		costInCredits: Float
		length: Float
		maxAtmospheringSpeed: Int
		crew: Int
		passengers: Int
		cargoCapacity: Float
		consumables: String
		hyperdriveRating: Float
		mglt: Int
		starshipClass: String
		pilots: [Person]
		films: [Film]
	}

	type Vehicle {
		id: ID!
		name: String
		model: String
		manufacturer: String
		costInCredits: Float
		length: Float
		maxAtmospheringSpeed: Int
		crew: Int
		passengers: Int
		cargoCapacity: Float
		consumables: String
		vehicleClass: String
		pilots: [Person]
		films: [Film]
	}
`;
