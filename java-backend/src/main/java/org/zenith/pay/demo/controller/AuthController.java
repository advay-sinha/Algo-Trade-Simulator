package org.zenith.pay.demo.controller;

import org.zenith.pay.demo.model.User;
import org.zenith.pay.demo.service.UserService;
import org.zenith.pay.demo.dto.AuthResponse;
import org.zenith.pay.demo.dto.UserDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")

@CrossOrigin(
    origins = "*",
    allowedHeaders = "*",
    methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE}
)
public class AuthController {

    @Autowired
    private UserService userService;

    // Sign up endpoint
    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signUp(@RequestBody User user) {
        try {
            // Validate required fields
            if (user.getEmail() == null || user.getEmail().trim().isEmpty() ||
                user.getPassword() == null || user.getPassword().trim().isEmpty() ||
                user.getName() == null || user.getName().trim().isEmpty()) {
                return ResponseEntity.badRequest()
                    .body(new AuthResponse(false, "All fields are required"));
            }

            User savedUser = userService.signUp(user);
            UserDTO userDTO = new UserDTO(
                savedUser.getId(),
                savedUser.getName(),
                savedUser.getEmail(),
                savedUser.getPurpose()
            );
            
            return ResponseEntity.ok(new AuthResponse(
                true,
                "User registered successfully",
                "token", // You'll need to implement JWT token generation
                userDTO
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                .body(new AuthResponse(false, e.getMessage()));
        }
    }

    // Login endpoint
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody User loginRequest) {
        try {
            if (loginRequest.getEmail() == null || loginRequest.getEmail().trim().isEmpty() ||
                loginRequest.getPassword() == null || loginRequest.getPassword().trim().isEmpty()) {
                return ResponseEntity.badRequest()
                    .body(new AuthResponse(false, "Email and password are required"));
            }

            User user = userService.login(loginRequest.getEmail(), loginRequest.getPassword());
            if (user != null) {
                UserDTO userDTO = new UserDTO(
                    user.getId(),
                    user.getName(),
                    user.getEmail(),
                    user.getPurpose()
                );
                
                return ResponseEntity.ok(new AuthResponse(
                    true,
                    "Login successful",
                    "token", // You'll need to implement JWT token generation
                    userDTO
                ));
            }
            
            return ResponseEntity.status(401)
                .body(new AuthResponse(false, "Invalid credentials"));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                .body(new AuthResponse(false, e.getMessage()));
        }
    }
}
