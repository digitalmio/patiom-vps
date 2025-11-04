export function Logo() {
	return (
		<>
			<div className="group-data-[collapsible=icon]:hidden py-2 px-2">
				<img src="/logo/patiom-logo.svg" alt="Patiom Logo" className="h-7" />
			</div>
			<div className="group-data-[collapsible=icon]:flex hidden py-2 justify-center">
				<img
					src="/logo/patiom-icon.svg"
					alt="Patiom"
					className="h-7"
					title="Patiom"
				/>
			</div>
		</>
	);
}
