# Downloads official centerline skeletons for every neuron in the mushroom body circuit.
# Prompts for the neuPrint token, keeps it only in this process, and removes it afterwards.
$ErrorActionPreference = 'Stop'
$secret = Read-Host 'neuPrint token' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:NEUPRINT_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & .\.venv\Scripts\python.exe scripts/extract_malecns_skeletons.py --rdp-tolerance 400 @args
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:NEUPRINT_TOKEN -ErrorAction SilentlyContinue
}
