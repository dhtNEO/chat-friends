variable "project_id" {
  description = "Projeto existente; faturamento e APIs são responsabilidade do proprietário"
  type        = string
}
variable "region" {
  type    = string
  default = "southamerica-east1"
}
variable "zone" {
  type    = string
  default = "southamerica-east1-a"
}
variable "name" {
  type    = string
  default = "chat-friends"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name))
    error_message = "Nome deve ter 3 a 21 caracteres minúsculos, números ou hífens."
  }
}
variable "machine_type" {
  type    = string
  default = "e2-medium"
}
variable "data_disk_gb" {
  type    = number
  default = 20
}
variable "client_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}
variable "labels" {
  type    = map(string)
  default = { application = "chat-friends", environment = "personal" }
}
